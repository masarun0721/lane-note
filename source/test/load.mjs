import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
export async function loadPages(f){
 const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(f)),cMapUrl:'node_modules/pdfjs-dist/cmaps/',cMapPacked:true,standardFontDataUrl:'node_modules/pdfjs-dist/standard_fonts/',verbosity:0}).promise;
 const pages=[];
 for(let p=1;p<=doc.numPages;p++){const pg=await doc.getPage(p);const vp=pg.getViewport({scale:1});const tc=await pg.getTextContent();
  pages.push({width:vp.width,height:vp.height,items:tc.items.filter(i=>i.str!==undefined).map(i=>({str:i.str,x:i.transform[4],y:vp.height-i.transform[5],w:i.width,h:i.height||Math.abs(i.transform[3])}))});}
 return pages;}
