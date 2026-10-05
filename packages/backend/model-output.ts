// Pure parser: offline replay must not initialize the credential or storage adapter.
export function parseModelOutput(content:string,finishReason:string|null):unknown{
 if(finishReason==='length')throw new Error('model_output_truncated');
 if(!content.trim())throw new Error('empty_model_output');
 try{return JSON.parse(content);}catch{throw new Error('invalid_model_json');}
}
