import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sinceLastVisit,judgmentVisit,notifyJudgmentChange,type JudgmentVisit} from '../apps/web/app/lib/since-last-visit.ts';
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {evaluateValuationRule} from '../packages/backend/valuation-rule.ts';

const current=evaluateValuationRule(seedHistory().points)!;
const previous:JudgmentVisit={as_of:'2026-09-30',rows:3788,band:'mid',pending:null};

test('新增数据日而判断未变：按数据行数计数，不把假期当成数据日',()=>{
 assert.deepEqual(sinceLastVisit(previous,{...previous,as_of:'2026-10-12',rows:3791}),{
  text:'自上次（2026.09.30）以来：新增 3 个数据日，判断未变。',changed:false,
 });
 assert.equal(sinceLastVisit(previous,previous)?.text,'自上次（2026.09.30）以来：新增 0 个数据日，判断未变。');
});

test('确认改判：告诉读者从哪个区间改为哪个区间',()=>{
 assert.deepEqual(sinceLastVisit(previous,{...previous,as_of:'2026-10-15',rows:3793,band:'high'}),{
  text:'自上次（2026.09.30）以来：新增 5 个数据日，已由中间区改为偏高区。',changed:true,
 });
});

test('确认进度变化：提示当前连续天数，回到原区间后移除旧进度',()=>{
 const pending={...previous,as_of:'2026-10-13',rows:3792,pending:{band:'high' as const,days:3,needed:5}};
 assert.deepEqual(sinceLastVisit({...previous,pending:{band:'high',days:1,needed:5}},pending),{
  text:'自上次（2026.09.30）以来：新增 4 个数据日，判断未变；已有 3/5 日落在偏高区。',changed:false,
 });
 assert.equal(sinceLastVisit(pending,{...previous,as_of:'2026-10-14',rows:3793})?.text,'自上次（2026.10.13）以来：新增 1 个数据日，判断未变。');
});

test('首次打开不显示，快照只保存接口的数据日、行数、区间与进度',()=>{
 assert.equal(sinceLastVisit(null,judgmentVisit(current)),null);
 assert.deepEqual(judgmentVisit(current),previous);
});

test('桌面改判通知需要许可，同次改判只提醒一次，手机与拒绝许可不提醒',()=>{
 const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const originalNotification=Object.getOwnPropertyDescriptor(globalThis,'Notification');
 const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const stored=new Map<string,string>();
 const notices:{title:string;body?:string}[]=[];
 let desktop=true;
 class TestNotification{
  static permission='denied';
  constructor(title:string,options:{body?:string}){notices.push({title,body:options.body});}
 }
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia:()=>({matches:desktop}),Notification:TestNotification}});
  Object.defineProperty(globalThis,'Notification',{configurable:true,value:TestNotification});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)}});
  const text='已由偏高区改为中间区';
  notifyJudgmentChange(current,text);
  TestNotification.permission='default';notifyJudgmentChange(current,text);
  assert.equal(notices.length,0);
  TestNotification.permission='granted';desktop=false;notifyJudgmentChange(current,text);
  assert.equal(notices.length,0);
  desktop=true;notifyJudgmentChange(current,text);notifyJudgmentChange({...current,as_of:'2026-10-09'},text);
  assert.deepEqual(notices,[{title:'经纬 · 判断已改变',body:text}]);
 }finally{
  for(const [key,descriptor]of [['window',originalWindow],['Notification',originalNotification],['localStorage',originalStorage]]as const){
   if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
  }
 }
});
