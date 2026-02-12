
import { q } from "../../core/01_dom.js";

export function renderDesign(){
  const root = q('#adminPanelBody');
  if(!root) return;
  root.innerHTML = `
    <div class="mk-card">
      <div class="mk-h3">Design</div>
      <div class="mk-muted">In this static build, Design controls are placeholders. Connect to settings/wallpapers nodes if needed.</div>
    </div>
  `;
}
