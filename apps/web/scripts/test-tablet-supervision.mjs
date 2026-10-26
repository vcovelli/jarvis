import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.pathname !== "/jarvis_operations_test" || database.searchParams.get("host") !== "/tmp/jarvis-operations-test/socket") throw new Error("Disposable operations database required");
if (!process.env.NEXTAUTH_SECRET || !process.env.OPERATIONS_PLAYWRIGHT_PATH) throw new Error("Test session secret and Playwright path required");
const { chromium } = await import(process.env.OPERATIONS_PLAYWRIGHT_PATH);
const base = 'http://127.0.0.1:3326';
const db = new PrismaClient();
const id = 'tablet-check-owner';
const secret = process.env.NEXTAUTH_SECRET;
const browser = await chromium.launch({headless: true});
const results = [];
try {
  await db.user.upsert({where:{id}, update:{}, create:{id,email:`${id}@example.test`,entitlement:{create:{tier:'OWNER',status:'active'}}}});
  const token=await encode({token:{id,sub:id,sessionVersion:0},secret});
  const context=await browser.newContext({viewport:{width:1184,height:576},reducedMotion:'reduce'});
  await context.addCookies([{name:'next-auth.session-token',value:token,url:base}]);
  await context.addInitScript(() => localStorage.setItem('jarvis-walkthrough-v2:tablet-check-owner:personal',JSON.stringify({version:2,welcomed:true,guides:{}})));
  const page=await context.newPage();
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.route('**/api/assistant/message', route=>route.abort());
  await mkdir('/tmp/jarvis-tablet-check/screenshots',{recursive:true});
  for (const size of [{width:1184,height:576},{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]) {
    await page.setViewportSize(size);
    await page.goto(base+'/v2');
    await page.locator('[data-guide="home-remote"], [data-guide="home-command"]').first().waitFor({state:'attached'});
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`/tmp/jarvis-tablet-check/screenshots/home-${size.width}.png`});
    await page.goto(base+'/v2/daily');
    await page.getByRole('button',{name:'Week',exact:true}).filter({visible:true}).waitFor();
    const week = page.getByRole('button',{name:'Week',exact:true}).filter({visible:true});
    assert.equal(await week.getAttribute('aria-expanded'),'false');
    if(size.width>=1024) {
      const rect=await page.locator('.planner-board-scroll').boundingBox();
      assert.ok(rect.height>=300, `Schedule height ${rect.height} at ${size.width}`);
      results.push({size,scheduleHeight:rect.height});
    }
    await week.click(); assert.equal(await week.getAttribute('aria-expanded'),'true');
    await page.locator('[data-guide="plan-days"]').filter({visible:true}).nth(2).click();
    await week.click();
    await page.getByRole('button',{name:'Today',exact:true}).filter({visible:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`/tmp/jarvis-tablet-check/screenshots/plan-${size.width}.png`});
  }
  const post = body => context.request.post(base+'/api/operations',{data:body,headers:{Origin:base}});
  assert.equal((await post({operation:'initialize'})).status(),200);
  await db.operationsProfile.update({where:{userId:id},data:{enabled:true,paused:false,workerSeenAt:new Date()}});
  await db.operationsRun.create({data:{id:'tablet-check-queued',userId:id,domain:'business',status:'queued',dedupeKey:'tablet-check-queued',createdAt:new Date(0)}});
  await page.setViewportSize({width:1184,height:576});
  await page.goto(base+'/v2/operations?view=activity');
  await page.getByRole('region',{name:'Agent roster'}).waitFor();
  const business=page.locator('article').filter({has:page.getByRole('heading',{name:'business',exact:true})});
  await business.getByText('Queued',{exact:true}).waitFor();
  assert.equal(await business.getByRole('button',{name:'Queue check',exact:true}).isDisabled(),true);
  await business.getByRole('button',{name:'New discussion',exact:true}).click();
  await page.waitForURL('**/v2/assistant?conversation=*');
  await page.getByRole('heading',{name:'business agent discussion',exact:true}).waitFor();
  await page.getByText('business agent · Queued',{exact:true}).waitFor();
  const conversationId = new URL(page.url()).searchParams.get('conversation');
  const conversation=await db.assistantConversation.findUnique({where:{id:conversationId}});
  assert.equal(conversation.domain,'agent-business');
  assert.equal(await db.assistantMessage.count({where:{conversationId}}),0,'Opening discussion must not send a message');
  await page.reload();
  await page.getByRole('heading',{name:'business agent discussion',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/jarvis-tablet-check/screenshots/agent-chat.png'});
  await page.goto(base+'/v2/operations?view=activity');
  await business.getByText('Queued',{exact:true}).waitFor();
  await business.getByText('Linked discussions · 1',{exact:true}).click();
  await business.getByRole('link',{name:'business agent discussion ↗',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/jarvis-tablet-check/screenshots/agents.png'});
  await page.getByRole('button',{name:'Emergency pause',exact:true}).click();
  await page.getByText('Saved. Any queued work still requires an active observation loop and worker.',{exact:true}).waitFor();
  assert.equal((await db.operationsRun.findUnique({where:{id:'tablet-check-queued'}})).status,'cancelled');
  for (const width of [768,390,320]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`/tmp/jarvis-tablet-check/screenshots/agents-${width}.png`});
  }
  await page.goto(base+`/v2/assistant?conversation=${conversationId}`);
  await page.getByRole('heading',{name:'business agent discussion',exact:true}).waitFor();
  await page.getByRole('button',{name:'New conversation',exact:true}).click();
  await page.waitForFunction(oldId => {
    const id = new URL(location.href).searchParams.get('conversation');
    return id && id !== oldId;
  }, conversationId);
  const newId = new URL(page.url()).searchParams.get('conversation');
  await page.reload();
  assert.equal(new URL(page.url()).searchParams.get('conversation'),newId);
  await page.getByRole('textbox',{name:'Message Jarvis'}).waitFor();
  await page.goto(base+'/v2/assistant?conversation=missing-test-thread');
  await page.getByText('I could not interpret that yet: Conversation not found.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  await writeFile('/tmp/jarvis-tablet-check/browser-results.json',JSON.stringify(results,null,2));
  console.log('PASS: responsive Home/Plan, week controls, schedule area, agent status, persisted discussion/deep link, no implicit model call, pause cancels work, no overflow or browser exceptions.',results);
} finally {
  await browser.close();
  await db.user.deleteMany({where:{id}});
  await db.$disconnect();
}
