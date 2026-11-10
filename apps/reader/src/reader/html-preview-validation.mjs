import { Parser } from 'parse5';
export const HTML_PREVIEW_LANGUAGES = Object.freeze(['', 'unknown', 'html', 'htm', 'html5']);
export const HTML_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
/** Structural eligibility, not a browser repair or a claim of full W3C conformance. */
export function validHtmlPreview(source, language = '') {
  if (typeof source !== 'string' || !HTML_PREVIEW_LANGUAGES.includes(String(language).trim().toLowerCase()) || source.length > HTML_PREVIEW_MAX_BYTES || source.includes('\0')) return false;
  if (new TextEncoder().encode(source).byteLength > HTML_PREVIEW_MAX_BYTES) return false;
  if (!/^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype\s+html\s*>/i.test(source)) return false;
  const errors = [];
  let document;
  const structure=[];let outsideContent=false;
  try {
    const parser=new Parser({sourceCodeLocationInfo:true,onParseError:error=>errors.push(error)});
    for(const method of ['onStartTag','onEndTag','onDoctype','onCharacter']) {
      const original=parser[method].bind(parser);
      parser[method]=token=>{
        if(method==='onDoctype')structure.push('doctype');
        else if(['html','head','body'].includes(token.tagName))structure.push((method==='onEndTag'?'/':'')+token.tagName);
        else if(![3,5].includes(structure.length) && (method!=='onCharacter'||token.chars.trim()))outsideContent=true;
        return original(token);
      };
    }
    parser.tokenizer.write(source,true);document=parser.document;
  } catch { return false; }
  if(outsideContent)return false;
  if(structure.join(',')!=='doctype,html,head,/head,body,/body,/html')return false;
  if (errors.length) return false;
  const significant = document.childNodes.filter(node => node.nodeName !== '#comment' && !(node.nodeName === '#text' && !node.value.trim()));
  if (significant.length !== 2 || significant[0].nodeName !== '#documentType' || significant[0].name !== 'html' || significant[1].tagName !== 'html') return false;
  const html = significant[1], children = html.childNodes.filter(node => node.nodeName !== '#comment' && !(node.nodeName === '#text' && !node.value.trim()));
  if (children.length !== 2 || children[0].tagName !== 'head' || children[1].tagName !== 'body') return false;
  for (const element of [html, ...children]) if (!element.sourceCodeLocation?.startTag || !element.sourceCodeLocation?.endTag) return false;
  // Do not offer previews for source with PHP/ASP processing instructions.
  // HTML strings and literal examples inside script/style/text remain data belonging to the document.
  const optionalEnd = new Set(['li','dt','dd','p','rt','rp','optgroup','option','colgroup','thead','tbody','tfoot','tr','td','th']);
  const voidElements = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const queue = [document]; let nodes = 0;
  while (queue.length) {
    const node = queue.pop(); if (++nodes > 50000) return false;
    if (node.nodeName === '#comment' && /^\s*(?:\?|%)/.test(node.data || '')) return false;
    if (node.tagName === 'html' && node !== html) return false;
    if(node.tagName && node.namespaceURI!=='http://www.w3.org/1999/xhtml') {
      const location=node.sourceCodeLocation;
      if(!location?.startTag || !location.endTag && !/\/\s*>$/.test(source.slice(location.startTag.startOffset,location.startTag.endOffset)))return false;
    }
    if (node.tagName && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const location=node.sourceCodeLocation;
      // An implicit table section is normal HTML; other fabricated elements
      // signal that the browser repaired malformed source.
      if (!location && !['tbody','colgroup'].includes(node.tagName)) return false;
      if (location && !voidElements.has(node.tagName) && !optionalEnd.has(node.tagName) && !location.endTag) return false;
      let end=location?.startTag?.endOffset ?? -1;
      for (const child of node.childNodes || []) {
        // Text locations can span closing tags when HTML relocates trailing
        // whitespace. The tokenizer above independently rejects prose outside
        // the explicit head/body, so element nesting is checked separately.
        if(child.nodeName==='#text')continue;
        const range=child.sourceCodeLocation;
        if (!range) continue;
        let boundary=location?.endTag?.startOffset;
        for(let parent=node.parentNode;boundary===undefined&&parent;parent=parent.parentNode)boundary=parent.sourceCodeLocation?.endTag?.startOffset;
        const childEnd=child.tagName&&optionalEnd.has(child.tagName)&&!range.endTag&&boundary!==undefined?Math.min(range.endOffset,boundary):range.endOffset;
        if (range.startOffset < end || boundary!==undefined && childEnd > boundary) return false;
        end=childEnd;
      }
    }
    queue.push(...(node.childNodes || [])); if (node.content) queue.push(node.content);
  }
  return true;
}
