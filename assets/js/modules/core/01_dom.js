
export const $ = (sel, root=document)=>root.querySelector(sel);
export const $$ = (sel, root=document)=>Array.from(root.querySelectorAll(sel));

export function safeOn(el, evt, fn, opts){
  if(!el) return;
  el.addEventListener(evt, fn, opts);
}
