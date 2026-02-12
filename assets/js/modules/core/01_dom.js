export const q=(s,root=document)=>root.querySelector(s);
export const qa=(s,root=document)=>Array.from(root.querySelectorAll(s));

export function safeAppend(parent, child){ if(parent && child && parent.appendChild) parent.appendChild(child); }
