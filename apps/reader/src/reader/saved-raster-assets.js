// Display-only validation for the exact turn.assets raster attachments retained
// by Enhanced. This never opens source pointers or modifies archived records.
export const SAVED_RASTER_LIMITS = Object.freeze({images:16, candidates:64, imageBytes:5*1024*1024, totalBytes:32*1024*1024, dimension:8192, imagePixels:32*1024*1024, totalPixels:64*1024*1024});
const dataPattern=/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
export function savedRasterDimensions(width,height){return Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=SAVED_RASTER_LIMITS.dimension&&height<=SAVED_RASTER_LIMITS.dimension&&width*height<=SAVED_RASTER_LIMITS.imagePixels;}
function dimensions(binary,mime){
 const b=i=>binary.charCodeAt(i),u16=i=>b(i)*256+b(i+1),le16=i=>b(i)+b(i+1)*256,u32=i=>b(i)*16777216+b(i+1)*65536+b(i+2)*256+b(i+3),le24=i=>b(i)+b(i+1)*256+b(i+2)*65536,le32=i=>le24(i)+b(i+3)*16777216;
 if(mime==='png')return binary.length>=33&&binary.slice(0,8)==='\x89PNG\r\n\x1a\n'&&u32(8)===13&&binary.slice(12,16)==='IHDR'?[u32(16),u32(20)]:null;
 if(mime==='gif')return binary.length>=13&&/^GIF8[79]a$/.test(binary.slice(0,6))?[le16(6),le16(8)]:null;
 if(mime==='jpeg'){
  if(binary.length<4||b(0)!==255||b(1)!==216)return null;
  for(let i=2;i<binary.length;){
   if(b(i++)!==255)return null;while(i<binary.length&&b(i)===255)i++;
   const marker=b(i++);if(marker===0xda||marker===0xd9)return null;
   if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
   if(i+2>binary.length)return null;const length=u16(i);if(length<2||i+length>binary.length)return null;
   if(sof.has(marker))return length>=8?[u16(i+5),u16(i+3)]:null;
   i+=length;
  }
  return null;
 }
 if(mime==='webp'){
  if(binary.length<20||binary.slice(0,4)!=='RIFF'||binary.slice(8,12)!=='WEBP'||le32(4)+8!==binary.length)return null;
  for(let i=12;i+8<=binary.length;){
   const type=binary.slice(i,i+4),length=le32(i+4),at=i+8;if(at+length>binary.length)return null;
   if(type==='VP8X')return length>=10?[le24(at+4)+1,le24(at+7)+1]:null;
   if(type==='VP8L')return length>=5&&b(at)===0x2f?[1+b(at+1)+((b(at+2)&63)<<8),1+(b(at+2)>>6)+(b(at+3)<<2)+((b(at+4)&15)<<10)]:null;
   if(type==='VP8 ')return length>=10&&binary.slice(at+3,at+6)==='\x9d\x01\x2a'?[le16(at+6)&0x3fff,le16(at+8)&0x3fff]:null;
   i=at+length+(length%2);
  }
 }
 return null;
}
function raster(value){
 if(typeof value!=='string'||value.length>Math.ceil(SAVED_RASTER_LIMITS.imageBytes/3)*4+64)return null;
 const match=dataPattern.exec(value);if(!match)return null;const payload=match[2];if(payload.length%4)return null;
 const bytes=payload.length/4*3-(payload.endsWith('==')?2:payload.endsWith('=')?1:0);if(bytes>SAVED_RASTER_LIMITS.imageBytes)return null;
 let binary;try{binary=atob(payload);}catch{return null;}if(binary.length!==bytes)return null;
 const size=dimensions(binary,match[1]);if(!size||!savedRasterDimensions(...size))return null;
 return {bytes,width:size[0],height:size[1]};
}
export function normalizeSavedRasterAssets(value){
 const images=[];if(!Array.isArray(value))return {images,unavailable:false};
 const seen=new Set();let bytes=0,pixels=0,unavailable=value.length>SAVED_RASTER_LIMITS.candidates;
 for(const asset of value.slice(0,SAVED_RASTER_LIMITS.candidates)){
  if(!asset||typeof asset!=='object'||Array.isArray(asset)){unavailable=true;continue;}
  if(typeof asset.url==='string'&&seen.has(asset.url))continue;
  if(images.length>=SAVED_RASTER_LIMITS.images){unavailable=true;continue;}
  const meta=raster(asset.url);if(!meta||bytes+meta.bytes>SAVED_RASTER_LIMITS.totalBytes||pixels+meta.width*meta.height>SAVED_RASTER_LIMITS.totalPixels){unavailable=true;continue;}
  seen.add(asset.url);bytes+=meta.bytes;pixels+=meta.width*meta.height;
  images.push({url:asset.url,label:typeof asset.label==='string'?asset.label.slice(0,500):'',source:typeof asset.source==='string'?asset.source.slice(0,2048):'',width:meta.width,height:meta.height});
 }
 return {images,unavailable};
}
