import { randomUUID } from 'node:crypto';
import { mutateState,readState } from './storage.ts';
import {keychainStore,type CredentialStore} from './credentials.ts';
let sessionKey:string|null=null;
let authorized=false;
export const PRICE_POLICY={model:'deepseek-flash',input_micro_cny_per_token:2,output_micro_cny_per_token:8,max_output_tokens:5000,verified_on:'2026-10-02',url:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'} as const;
export function sessionState(){return {has_key:Boolean(sessionKey),authorized,model:PRICE_POLICY.model};}
export function sessionCredential(){if(!sessionKey||!authorized)throw new Error('model_setup_required');return sessionKey;}
export function clearSession(){sessionKey=null;authorized=false;}
export async function restoreSavedCredential(interactive=false,store:CredentialStore=keychainStore){
 authorized=false;
 try{const key=await store.load(interactive);if(key)sessionKey=key;return {...sessionState(),restored:Boolean(key),error:null};}
 catch(e){return {...sessionState(),restored:false,error:e instanceof Error?e.message:'keychain_failed'};}
}
export async function removeSavedCredential(store:CredentialStore=keychainStore){clearSession();await store.remove();await mutateState(async state=>{state.owner_preferences={restore_saved_key_on_start:false};});return sessionState();}
export async function configureSession(input:{key?:string;limit_cny?:number;authorize:boolean;save_to_keychain?:boolean},store:CredentialStore=keychainStore){
 if(!input.authorize)authorized=false; // Revocation survives a failed or cancelled Keychain save.
 if(input.key&&(!input.key.trim()||input.key.length>500))throw new Error('invalid_key');
 if(input.authorize&&(!Number.isFinite(input.limit_cny)||input.limit_cny!<=0||input.limit_cny!>1000))throw new Error('invalid_budget');
 if(input.save_to_keychain&&!input.key?.trim())throw new Error('keychain_key_required'); // Never migrate the in-memory key.
 if(input.authorize){await mutateState(async state=>{
  const limit=Math.floor(input.limit_cny!*1e6);if(state.budget&&limit<state.budget.reserved_micro_cny)throw new Error('budget_below_reserved');
  if(state.budget)state.budget.limit_micro_cny=limit;
  else state.budget={id:randomUUID(),limit_micro_cny:limit,reserved_micro_cny:0,approved_at:new Date().toISOString(),reservations:[]};
 });}
 if(input.save_to_keychain){await store.save(input.key!.trim());await mutateState(async state=>{state.owner_preferences={restore_saved_key_on_start:true};});}
 if(input.key)sessionKey=input.key.trim();authorized=input.authorize;
 return sessionState();
}
export async function setupWaitingReason(){if(!sessionKey)return 'key_required';if(!authorized)return 'budget_approval_required';const state=await readState();if(!state.budget)return 'budget_approval_required';if(state.budget.reserved_micro_cny>=state.budget.limit_micro_cny)return 'budget_exhausted';return null;}
export function estimateReservation(serializedMessages:string){
 // UTF-8 bytes conservatively bound text tokens; add room for chat wrappers.
 const inputTokens=Buffer.byteLength(serializedMessages,'utf8')+2048;
 if(inputTokens>100000)throw new Error('input_too_large');
 return inputTokens*PRICE_POLICY.input_micro_cny_per_token+PRICE_POLICY.max_output_tokens*PRICE_POLICY.output_micro_cny_per_token;
}
export async function reserveCost(amount:number,taskId:string|null){
 sessionCredential();return mutateState(async state=>{
  const b=state.budget;if(!b||!Number.isSafeInteger(amount)||amount<=0||b.reserved_micro_cny+amount>b.limit_micro_cny)throw new Error('budget_exhausted');
  const reservation={id:randomUUID(),task_id:taskId,amount_micro_cny:amount,at:new Date().toISOString(),outcome:'started' as const};b.reserved_micro_cny+=amount;b.reservations.push(reservation);return reservation.id;
 });
}
export async function finishReservation(id:string,outcome:'completed'|'uncertain'){await mutateState(async s=>{const r=s.budget?.reservations.find(r=>r.id===id);if(r)r.outcome=outcome;});}
