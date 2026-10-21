/** Fully synthetic provider fixtures. No user exports or identifiers. */
export const chatgpt = {
  id:'synthetic-chat',title:'Branches and code',current_node:'answer',create_time:0,
  mapping:{
    root:{parent:null,message:null},
    prompt:{parent:'root',message:{id:'p1',author:{role:'user'},create_time:0,content:{content_type:'text',parts:['Explain a tiny example.']}}},
    thought:{parent:'prompt',message:{id:'t1',author:{role:'assistant'},channel:'analysis',create_time:60,metadata:{model_slug:'model-A'},content:{content_type:'text',parts:['Consider two alternatives.']}}},
    recap:{parent:'thought',message:{id:'r1',author:{role:'assistant'},create_time:61,metadata:{tool_icons:['search']},content:{content_type:'reasoning_recap',text:'Thought for 2 seconds'}}},
    answer:{parent:'recap',message:{id:'a1',author:{role:'assistant'},create_time:62,metadata:{model_slug:'model-B'},content:{content_type:'text',parts:['Example:\n```pascal\nwriteln(1);\n```']}}},
    alternate:{parent:'prompt',message:{id:'alt1',author:{role:'assistant'},create_time:63,content:{content_type:'text',parts:['Alternative retained reply.']}}},
  },
};
export const claude = {uuid:'synthetic-claude',name:'Explicit blocks',created_at:'2026-09-20',chat_messages:[
  {uuid:'u',sender:'human',created_at:'2026-09-20T10:00:00+02:00',content:[{type:'text',text:'Please calculate.'}]},
  {uuid:'a',sender:'assistant',model:'claude-synthetic',content:[{type:'thinking',thinking:'Review the arithmetic.'},{type:'redacted_thinking',data:'synthetic-redaction'},{type:'tool_use',id:'call-1',name:'calculator',input:{expression:'1+1'}},{type:'text',text:'The result is two.'}]},
  {uuid:'out',sender:'human',content:[{type:'tool_result',tool_use_id:'call-1',content:'2'}]},
]};
export const studio={id:'studio',title:'Chunk relationships',runSettings:{model:'gemini-synthetic'},chunkedPrompt:{chunks:[
  {role:'user',text:'First prompt.'},{role:'user',text:'More context.'},{role:'model',isThought:true,text:'A thought.'},{role:'model',text:'Response part one.'},{role:'model',text:'Response part two.'},{role:'user',text:'Second prompt.'},{role:'model',text:'Second response.'},
]}};
const reasoning={id:'item-reason',type:'reasoning',model_id:'agent-model',created_at:100,completed_at:101,content:[{type:'output_text',text:'Plan the search.'}]};
const search={id:'item-search',type:'webSearch',created_at:101,completed_at:102,status:'completed',query:'synthetic query',sources:[{url:'https://example.org/page',title:'Synthetic source'}]};
const call={id:'item-call',type:'serverFunctionCall',call_id:'call-agent',name:'web_lookup',created_at:102,completed_at:103,arguments:'{"query":"synthetic"}',status:'completed'};
const output={id:'item-output',type:'serverFunctionCallOutput',call_id:'call-agent',created_at:103,completed_at:104,output:'Synthetic output.',status:'completed'};
const answer={id:'item-answer',type:'message',created_at:104,completed_at:105,content:[{type:'output_text',text:'Final synthetic answer.'}]};
export const venice={format:'venice-chat-history',formatVersion:1,owners:[{ownerId:'synthetic-owner',conversations:[{id:'v1',name:'Agent events',messages:[
  {id:'v-user',role:'user',content:'Search a synthetic source.',createdAtUnixTimestamp:100},
  {id:'v-agent',role:'assistant',content:'Final synthetic answer.',createdAtUnixTimestamp:100,context_metadata:{total_tokens:500,max_context_length:10000},output_items:[reasoning,search,call,output,answer],agentSegments:[{type:'reasoning',text:'Plan the search.',raw:structuredClone(reasoning)},{type:'tool',raw:structuredClone(search)},{type:'tool',raw:structuredClone(call)},{type:'tool',raw:structuredClone(output)},{type:'text',text:'Final synthetic answer.',raw:structuredClone(answer)}]},
]}]}]};
export const lmstudio={id:'local',name:'Versioned local chat',lastUsedModel:{identifier:'local-model'},messages:[
  {currentlySelected:0,versions:[{role:'user',content:[{type:'text',text:'Pick a version.'}]}]},
  {currentlySelected:1,versions:[{role:'assistant',senderInfo:{senderName:'model-old'},content:[{type:'text',text:'Old answer.'}]},{role:'assistant',senderInfo:{senderName:'model-new'},steps:[{type:'status',status:'loading'},{type:'contentBlock',style:{type:'thinking'},content:[{type:'text',text:'Compare the versions.'}]},{type:'contentBlock',content:[{type:'text',text:'Selected answer.'}]}]}]},
]};
export const openrouter={id:'router',platform:'openrouter',turns:[{id:'u',role:'user',content:'One sentence.',timestamp:'2026-09-21T00:00:00Z'},{id:'a',role:'assistant',model:'vendor/model',content:'A concise example.',usage:{prompt_tokens:4,completion_tokens:5,total_tokens:9,completion_tokens_details:{reasoning_tokens:1}},duration_ms:250}]};
export const grok={projects:[],tasks:[],media_posts:[],conversations:[{conversation:{id:'g1',title:'Grok synthetic'},responses:[{response:{_id:'g-u',sender:'human',message:'Ask.',create_time:{$date:{$numberLong:'0'}}}},{response:{_id:'g-a',sender:'ASSISTANT',message:'Answer.',model:'grok-synthetic',agent_thinking_traces:[{thinking_trace:'Exported trace.'}]}}]}]};
export const meta={fbid:'synthetic-account',label_values:[{label:'Conversation_09-21-2026.txt',value:'You: ```text\nMeta AI: inside code, not a speaker\n```\nMeta AI: Synthetic response.\n'}]};
export const gemini=[{header:'Gemini',title:'Prompted First synthetic activity',titleUrl:'https://gemini.google.com/app/synthetic',time:'2026-09-22',response:'A recorded activity response.'},{header:'Gemini',title:'Prompted Second synthetic activity',titleUrl:'https://gemini.google.com/app/synthetic',time:'2026-09-23T12:00:00Z'}];
export const normalized={provider:'openai',conversationKey:'normalized-copy',title:'Reduced data',turns:[{source_message_id:'n-user',user:'A surviving prompt.',createdAt:'2026-09-24'},{source_message_id:'n-ai',thinking:'A surviving thought.',ai:'A surviving answer.',model:'surviving-model'}]};
export function mixedDocuments(){return structuredClone([chatgpt,claude,studio,venice,lmstudio,openrouter,grok,meta,...gemini,normalized,{metadataOnly:true}]);}
