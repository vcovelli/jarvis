import { callPlaid } from "@/lib/plaid";
import { decryptSecret } from "@/lib/serverCrypto";

export type PlaidRemovalResult = { attempted: boolean; removed: boolean; warning: string | null };

export async function removePlaidItem(provider: string, accessTokenEncrypted: string): Promise<PlaidRemovalResult> {
  if (provider !== "plaid") return { attempted: false, removed: false, warning: null };
  try {
    await callPlaid("/item/remove", { access_token: decryptSecret(accessTokenEncrypted) });
    return { attempted: true, removed: true, warning: null };
  } catch {
    return { attempted: true, removed: false, warning: "Plaid item removal failed." };
  }
}
