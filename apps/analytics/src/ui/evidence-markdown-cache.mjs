/** Keep only bounded Markdown controls for the evidence page being displayed. */
export function createEvidenceMarkdownCache(maximum=100){
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>100)throw new TypeError('Invalid evidence page cache limit.');
 const entries=new Map();
 return Object.freeze({
  get size(){return entries.size;},
  get(id){return entries.get(id);},
  set(id,value){entries.delete(id);entries.set(id,value);while(entries.size>maximum)entries.delete(entries.keys().next().value);return value;},
  clear(){entries.clear();}
 });
}
