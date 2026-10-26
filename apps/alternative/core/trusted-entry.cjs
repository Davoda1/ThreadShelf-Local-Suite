'use strict';
// Chromium may escape unreserved file-path characters differently from Node.
// Compare the decoded native path without relaxing window/frame identity,
// protocol, host, query, path case or encoded native-separator restrictions.
// A backslash is a filename character on POSIX, but a separator on Windows.
const {fileURLToPath}=require('node:url');
function isTrustedFileURL(actual,expected,{allowFragment=false,windows=process.platform==='win32'}={}){
  if(typeof actual!=='string'||typeof expected!=='string'||(!allowFragment&&actual.includes('#')))return false;
  if((allowFragment?actual.split('#')[0]:actual).includes('?'))return false;
  try{
    const source=new URL(actual),target=new URL(expected);
    if(source.protocol!=='file:'||target.protocol!=='file:'||source.host!==target.host||source.search||target.search||target.hash||/%2f/i.test(source.pathname)||(windows&&/%5c/i.test(source.pathname)))return false;
    return fileURLToPath(source,{windows})===fileURLToPath(target,{windows});
  }catch{return false;}
}
function isTrustedMainFrame(event,webContents,expected,options){
  const frame=event?.senderFrame;
  return !!webContents&&event?.sender===webContents&&frame===webContents.mainFrame&&isTrustedFileURL(frame?.url,expected,options);
}
module.exports={isTrustedFileURL,isTrustedMainFrame};
