import { invariant } from '../core/errors.mjs';

export function isNativeReadOnly(name) {
  return /^(?:feishu_)?(?:get|list|search|read)_/.test(name) || name==='feishu_auth_url';
}
export function isNativeDestructive(name) {
  return /(?:delete|remove|destroy|truncate|overwrite)/i.test(name) || name==='feishu_update_document';
}
// A small schema summary for discoverability. Actual validation always uses each
// upstream's own Zod schema, not this summary. Native MCP registration retains
// the complete schema and the SDK performs its normal JSON-schema conversion.
function schemaSummary(schema,depth=0) {
  if(!schema || depth>8)return {type:'unknown'};
  const def=schema._def??schema.def??{};
  let kind=(def.typeName??(typeof def.type==='string'?def.type:'unknown')).replace(/^Zod/,'').toLowerCase();
  const result={type:kind}; if(schema.description)result.description=schema.description;
  if(schema.isOptional?.())result.optional=true;
  if(schema.shape){result.type='object';result.properties={};for(const[k,v]of Object.entries(schema.shape))result.properties[k]=schemaSummary(v,depth+1);}
  else if(kind==='optional'||kind==='default'||kind==='nullable')Object.assign(result,schemaSummary(def.innerType,depth+1),kind==='nullable'?{nullable:true}:{optional:true});
  else if(kind==='array')result.items=schemaSummary(def.element??def.type,depth+1);
  else if(kind==='enum')result.values=def.values??Object.values(def.entries??{});
  else if(kind==='literal')result.value=def.value??def.values;
  else if(kind==='union')result.options=(def.options??[]).map(v=>schemaSummary(v,depth+1));
  else if(kind==='effects')Object.assign(result,schemaSummary(def.schema,depth+1));
  return result;
}
export class NativeCatalog {
  constructor({allowWrites=false,allowDestructive=false,appId}={}) {this.entries=new Map();Object.assign(this,{allowWrites,allowDestructive,appId});}
  collector(origin,z) {
    const add=(name,config,handler)=>{
      const key=`${origin}__${name}`;
      invariant(!this.entries.has(key),'DUPLICATE_TOOL',`Duplicate native tool ${key}`);
      const schema=config.inputSchema?.parse?config.inputSchema:z.object(config.inputSchema??{});
      this.entries.set(key,{key,origin,name,config:{...config,inputSchema:schema},schema,handler});
      return {remove:()=>this.entries.delete(key),disable:()=>{this.entries.get(key).disabled=true;},enable:()=>{this.entries.get(key).disabled=false;},update:()=>{throw new Error('Dynamic native tool updates are not supported');}};
    };
    return {
      registerTool:(name,config,handler)=>add(name,config,handler),
      tool:(name,...args)=>{
        const handler=args.pop(); const description=typeof args[0]==='string'?args.shift():'';
        const inputSchema=args.shift()??{}; const annotations=args.shift();
        invariant(typeof handler==='function','UNSUPPORTED_TOOL_REGISTRATION',`Unexpected registration contract for ${name}`);
        return add(name,{description,inputSchema,...(annotations?{annotations}:{})},handler);
      }
    };
  }
  list({origin,query='',includeSchemas=true}={}) {
    return [...this.entries.values()].filter(e=>(!origin||e.origin===origin)&&`${e.name} ${e.config.description}`.toLowerCase().includes(query.toLowerCase())).map(e=>({
      name:e.key,description:e.config.description,readOnly:isNativeReadOnly(e.name),destructive:isNativeDestructive(e.name),
      ...(includeSchemas?{inputSchemaSummary:schemaSummary(e.schema),schemaNote:'Summary only; the original upstream schema validates every invocation.'}:{})
    }));
  }
  async call(key,args,extra={}) {
    const entry=this.entries.get(key);invariant(entry&&!entry.disabled,'NATIVE_TOOL_NOT_FOUND','Native tool not found',{key});
    // OAuth callback must remain on the local browser callback route. Single-app
    // mode deliberately does not allow a model to reconfigure credential storage.
    invariant(!['feishu_add_app','feishu_set_default_app','feishu_auth_callback','feishu_auth_url'].includes(entry.name),
      'NATIVE_ADMIN_DISABLED','Use .env and kb_auth for this single-account local integration');
    if(args?.appId)invariant(args.appId===this.appId,'APP_ID_MISMATCH','This instance is bound to the configured app');
    invariant(isNativeReadOnly(entry.name)||this.allowWrites,'NATIVE_WRITES_DISABLED','Use the kb_* preview/apply tools, or explicitly enable FUSION_ALLOW_NATIVE_WRITES in .env');
    invariant(!isNativeDestructive(entry.name)||this.allowDestructive,'NATIVE_DESTRUCTIVE_DISABLED','This native action can delete or rebuild documents. FUSION_ALLOW_NATIVE_DESTRUCTIVE is required.');
    const parsed=await entry.schema.parseAsync(args);
    return entry.handler(parsed,extra);
  }
  registerNative(server,wrap) {
    for(const entry of this.entries.values()) {
      server.registerTool(entry.key,entry.config,wrap((args,extra)=>this.call(entry.key,args,extra)));
    }
  }
}
