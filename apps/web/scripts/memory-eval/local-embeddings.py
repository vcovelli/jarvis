"""Evaluation-only CPU endpoint. Explicit local files; no model downloads or remote code.

The request format matches memory/embedding.ts. Array inputs are an evaluation-only
bulk-ingestion convenience; the application adapter still sends one string per job.
"""
import argparse
import hashlib
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

os.environ["TOKENIZERS_PARALLELISM"] = "false"
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

parser = argparse.ArgumentParser()
parser.add_argument("--model-dir", type=Path, required=True)
parser.add_argument("--port", type=int, default=3331)
parser.add_argument("--threads", type=int, default=2)
args = parser.parse_args()
manifest = json.loads((Path(__file__).parent / "model-manifest.json").read_text())
for name, expected in manifest["files"].items():
    if hashlib.sha256((args.model_dir / name).read_bytes()).hexdigest() != expected["sha256"]:
        raise RuntimeError("Model artifact checksum mismatch: " + name)
tokenizer = Tokenizer.from_file(str(args.model_dir / "tokenizer.json"))
tokenizer.enable_truncation(max_length=256)
tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
options = ort.SessionOptions()
options.intra_op_num_threads = args.threads
options.inter_op_num_threads = 1
options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
session = ort.InferenceSession(str(args.model_dir / "onnx/model.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
input_names = {item.name for item in session.get_inputs()}


def encode(texts):
    encoded = tokenizer.encode_batch(texts)
    values = {
        "input_ids": np.asarray([item.ids for item in encoded], dtype=np.int64),
        "attention_mask": np.asarray([item.attention_mask for item in encoded], dtype=np.int64),
        "token_type_ids": np.asarray([item.type_ids for item in encoded], dtype=np.int64),
    }
    output = session.run(None, {key: value for key, value in values.items() if key in input_names})[0]
    mask = values["attention_mask"][..., None].astype(np.float32)
    pooled = (output * mask).sum(axis=1) / np.maximum(mask.sum(axis=1), 1e-9)
    pooled /= np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-9)
    return pooled.tolist()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log queries or memory content.

    def send_json(self, status, value):
        body = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path != "/health":
            return self.send_json(404, {"error": "not_found"})
        self.send_json(200, {"model": manifest["model"], "revision": manifest["revision"], "dimensions": 384, "runtime": ort.__version__, "threads": args.threads, "providers": session.get_providers(), "maximumTokens": 256})

    def do_POST(self):
        try:
            if self.path != "/v1/embeddings":
                return self.send_json(404, {"error": "not_found"})
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 262144:
                return self.send_json(413, {"error": "body_limit"})
            body = json.loads(self.rfile.read(size))
            texts = body.get("input")
            texts = [texts] if isinstance(texts, str) else texts
            if body.get("model") != manifest["model"] or not isinstance(texts, list) or not 1 <= len(texts) <= 64 or not all(isinstance(text, str) and 0 < len(text) <= 4000 for text in texts):
                return self.send_json(400, {"error": "invalid_input"})
            start = time.perf_counter()
            vectors = encode(texts)
            self.send_json(200, {"model": manifest["model"], "data": [{"index": index, "embedding": vector} for index, vector in enumerate(vectors)], "inferenceMs": round((time.perf_counter() - start) * 1000, 3)})
        except Exception:
            self.send_json(500, {"error": "local_embedding_failed"})


encode(["Synthetic warmup; no personal information."])
print(json.dumps({"ready": True, "address": "127.0.0.1", "port": args.port, "model": manifest["model"], "revision": manifest["revision"]}), flush=True)
HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
