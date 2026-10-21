import {UI_PALETTES,CODE_THEMES} from './themes.mjs';
export {UI_PALETTES,CODE_THEMES};
const root=document.documentElement;
export function applyAppearance(settings={}){
  const appearance=settings.appearance||'system',mode=appearance==='system'?(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):appearance;
  const palette=UI_PALETTES.find(p=>p.id===settings.uiPalette)||UI_PALETTES[0],code=CODE_THEMES.find(p=>p.id===settings.codeTheme)||CODE_THEMES[0];
  for(const name of Array.from(root.style)){if(name.startsWith('--'))root.style.removeProperty(name);}
  for(const [key,value] of Object.entries(palette.tokens[mode]||{}))root.style.setProperty('--'+key,value);
  for(const [key,value] of Object.entries(code.tokens[mode]||{}))root.style.setProperty('--syntax-'+key,value);
  if(settings.highContrast){root.style.setProperty('--border','currentColor');root.style.setProperty('--muted','var(--text)');root.style.setProperty('--faint','var(--text)');}
  root.dataset.theme=mode;root.dataset.uiPalette=palette.id;root.dataset.codeTheme=code.id;
  root.dataset.contrast=settings.highContrast?'high':'normal';root.dataset.motion=settings.reducedMotion?'reduced':'normal';root.dataset.transparency=settings.reducedTransparency?'reduced':'normal';
  root.lang=settings.language||'en';
}
