/** Only bounded numeric limit context may enter a copied diagnostic. */
export function safeDiagnosticLimit(value){
 if(!value||!['nodes','depth'].includes(value.kind)||!['document','input'].includes(value.scope)||!Number.isSafeInteger(value.observed)||value.observed<0||!Number.isSafeInteger(value.maximum)||value.maximum<(value.kind==='nodes'?1:0))return null;
 return{kind:value.kind,observed:value.observed,maximum:value.maximum,scope:value.scope,...(Number.isSafeInteger(value.documentIndex)&&value.documentIndex>=0?{documentIndex:value.documentIndex}:{})};
}
