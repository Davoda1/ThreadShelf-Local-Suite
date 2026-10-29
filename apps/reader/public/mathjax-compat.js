/* ThreadShelf MathJax 4.1.3 output compatibility. No MathJax 3 runtime is included. */
(() => {
  'use strict';
  function install(mathjax) {
    const fontAPI=mathjax?._?.output?.svg?.FontData;
    const Factory=mathjax?._?.output?.svg?.WrapperFactory?.SvgWrapperFactory;
    const Mo=mathjax?._?.output?.svg?.Wrappers?.mo?.SvgMo;
    const classes=mathjax?._?.core?.MmlTree?.MmlNode?.TEXCLASS;
    if(mathjax?.version!=='4.1.3'||typeof Factory!=='function'||typeof Mo?.prototype?.protoBBox!=='function'||typeof Mo?.prototype?.addExtH!=='function'||typeof Mo?.prototype?.addExtV!=='function'||!classes||fontAPI.HFUZZ!==.07||fontAPI.VFUZZ!==.07) {
      throw new Error('Output compatibility requires the verified MathJax 4.1.3 API');
    }
    const tex=mathjax._.input.tex;
    const macros=tex.MapHandler.MapHandler.getMap('macros');
    const Macro=tex.Token.Macro;
    const Accent=tex.base.BaseMethods.default.Accent;
    const vec=macros?.lookup('vec');
    if(typeof macros?.add!=='function'||typeof Macro!=='function'||vec?.func!==Accent||JSON.stringify(vec?.args)!=='["2192",false]') {
      throw new Error('Unexpected MathJax 4.1.3 standard vector macro');
    }
    // v4 supplied a new false flag to its standard vector accent. Keep the
    // established zero-width accent semantics using the v4 parser method.
    macros.add('vec',new Macro('vec',Accent,['2192']));
    // Restore three names removed from the standard v4 base tables. These
    // aliases invoke the existing v4 font/token handlers, with no new syntax.
    const SetFont=tex.base.BaseMethods.default.SetFont;
    const operators=tex.MapHandler.MapHandler.getMap('mathchar0mo');
    const divide=operators?.lookup('div');
    if(typeof SetFont!=='function'||!divide||typeof operators.add!=='function'||macros.lookup('bbFont')||macros.lookup('scr')||operators.lookup('divsymbol')) {
      throw new Error('Unexpected MathJax 4.1.3 base aliases');
    }
    macros.add('bbFont',new Macro('bbFont',SetFont,['double-struck']));
    macros.add('scr',new Macro('scr',SetFont,['script']));
    operators.add('divsymbol',divide);
    // Retained original TeX token values and declaration/size parameters.
    // Only constant map data changes; all handlers are the current v4 methods.
    const Token=tex.Token.Token;
    const identifiers=tex.MapHandler.MapHandler.getMap('mathchar0mi');
    const amsOperators=tex.MapHandler.MapHandler.getMap('AMSsymbols-mathchar0mo');
    if(typeof Token!=='function'||!identifiers?.lookup('backslash')||!amsOperators?.lookup('vDash')) throw new Error('Unexpected v4 symbol maps');
    identifiers.add('backslash',new Token('backslash','∖',{mathvariant:'normal'}));
    for(const [name,char] of [['perp','⊥'],['models','⊨'],['surd','√']]) operators.add(name,new Token(name,char,name==='perp'?{texClass:classes.REL}:null));
    amsOperators.add('vDash',new Token('vDash','⊨',{variantForm:true}));
    const originalMacros={
      frak:['SetFont','fraktur'], symbf:['MathFont','bold'], symsf:['MathFont','sans-serif'],
      tiny:['SetSize',.5], Tiny:['SetSize',.6], small:['SetSize',.85], large:['SetSize',1.2],
      Large:['SetSize',1.44], LARGE:['SetSize',1.73], huge:['SetSize',2.07], Huge:['SetSize',2.49],
      cases:['Matrix','{','','left left',null,'.1em',null,true],
    };
    for(const [name,[method,...args]] of Object.entries(originalMacros)){
      const handler=tex.base.BaseMethods.default[method];
      if(typeof handler!=='function'||!macros.lookup(name)) throw new Error('Unexpected v4 font/size macro');
      macros.add(name,new Macro(name,handler,args));
    }
    const delimiters=tex.MapHandler.MapHandler.getMap('delimiter');
    const backslash=delimiters?.lookup('\\backslash');
    if(!backslash||delimiters.lookup('\\\\')) throw new Error('Unexpected MathJax 4.1.3 backslash delimiter');
    delimiters.add('\\\\',backslash);
    const amsMacros=tex.MapHandler.MapHandler.getMap('AMSmath-macros');
    const xArrow=tex.ams.AmsMethods.AmsMethods.xArrow;
    if(typeof xArrow!=='function') throw new Error('Unexpected v4 extensible-arrow handler');
    const setProperties=tex.NodeUtil.default.setProperties;
    if(typeof setProperties!=='function')throw new Error('Unexpected v4 node property API');
    function originalArrowLabel(parser,...args){
      const push=parser.Push;let pushes=0;
      parser.Push=function(pushed,...rest){
        const row=pushed?.childNodes?.[0],empty=row?.childNodes?.[0],arrow=row?.childNodes?.[1];
        const label=arrow?.childNodes?.[arrow.over],labelRow=label?.childNodes?.[0];
        const strut=labelRow?.childNodes?.at(-1),core=arrow?.childNodes?.[0]?.coreMO();
        if(rest.length||++pushes!==1||pushed?.kind!=='TeXAtom'||pushed.texClass!==classes.REL||
            row?.childNodes.length!==2||empty?.kind!=='TeXAtom'||empty.childNodes[0]?.childNodes.length!==0||
            !['munderover','mover'].includes(arrow?.kind)||label?.kind!=='mpadded'||strut?.kind!=='mspace'||
            !strut.attributes.hasExplicit('depth')||strut.attributes.get('depth')!=='.2em'||
            core?.kind!=='mo'||core.texClass!==classes.ORD||typeof row.removeChild!=='function') {
          throw new Error('Unexpected v4 extensible-arrow structure');
        }
        // Keep v4's parsing and generated content, restoring the established
        // label clearance and stretchable relation structure. V4's new empty
        // anti-stretch shell changes valid nested-arrow dimensions.
        strut.attributes.set('depth','.25em');
        setProperties(core,{texClass:classes.REL});
        row.removeChild(arrow);
        return push.call(this,arrow);
      };
      try{xArrow(parser,...args);if(pushes!==1)throw new Error('Unexpected v4 extensible-arrow output');}
      finally{parser.Push=push;}
    }
    for(const name of ['xrightarrow','xleftarrow']){
      const macro=amsMacros?.lookup(name);
      if(macro?.func!==xArrow)throw new Error('Unexpected v4 extensible-arrow macro');
      amsMacros.add(name,new Macro(name,originalArrowLabel,macro.args));
    }
    class OriginalEmptyFenceSpacing extends Mo {
      // Original font assemblies used .1em overlap; v4 uses .07em. Adjust
      // the assembly endpoints while retaining the v4 SVG implementation.
      addExtH(n,v,width,left,right,x=0) { super.addExtH(n,v,width,left-.03,right-.03,x); }
      addExtV(n,v,height,depth,top,bottom,width) {
        if(this.stretch.stretch.length===4){
          // V4 folds middle-piece sizes into negative endpoint positions.
          // Unfold them so the original overlap applies on both sides.
          if(depth<0 && bottom===0){ bottom=-depth;depth=0; }
          if(height<0 && top===0){ top=-height;height=0; }
        }
        super.addExtV(n,v,height,depth,top-.03,bottom-.03,width);
      }
      protoBBox(bbox) {
        const originalRight=bbox.R;
        super.protoBBox(bbox);
        // v4 added right spacing for an explicitly empty opening/closing
        // fence. Restore the established output without changing the font's
        // null-delimiter parameter (also used by fractions), or other fences.
        if(bbox.w===0 && this.node.attributes.hasExplicit('fence') && this.node.getText()==='' &&
            [classes.OPEN,classes.CLOSE].includes(this.node.texClass) && !this.jax.options.mathmlSpacing) bbox.R=originalRight;
      }
    }
    const Table=mathjax._.output.svg.Wrappers.mtable.SvgMtable;
    const MmlFactory=mathjax._.core.MmlTree.MmlFactory.MmlFactory;
    const baseClassMethod=mathjax._.core.MmlTree.MmlNode.AbstractMmlBaseNode.prototype.setTeXclass;
    const commonScale=mathjax._.output.common.Wrapper.CommonWrapper.prototype.getScale;
    if(typeof Table?.prototype?.getBBoxLR!=='function'||typeof MmlFactory!=='function'||typeof baseClassMethod!=='function'||typeof commonScale!=='function') throw new Error('Unexpected v4 node/scale factories');
    class OriginalTableSpacing extends Table {
      getBBoxLR(){return this.hasLabels?super.getBBoxLR():[0,0];}
    }
    const originalNodeClasses={...MmlFactory.defaultNodes};
    for(const name of ['msub','msup','msubsup','munder','mover','munderover']){
      const Base=originalNodeClasses[name];
      if(Base.prototype.setTeXclass!==baseClassMethod) throw new Error('Unexpected v4 scripted-node classification');
      originalNodeClasses[name]=class extends Base {
        setTeXclass(previous){
          const result=super.setTeXclass(previous);
          if(!this.isEmbellished && this.childNodes[0]?.kind==='TeXAtom') this.texClass=classes.ORD;
          return result;
        }
      };
    }
    const Space=originalNodeClasses.mspace;
    if(typeof Object.getOwnPropertyDescriptor(Space.prototype,'isSpacelike')?.get!=='function')throw new Error('Unexpected v4 space classification');
    // Original MathML spaces were spacelike even with explicit depth, height,
    // or negative width. Keep that classification; v4 canBreak is unchanged.
    originalNodeClasses.mspace=class extends Space {get isSpacelike(){return true;}};
    for(const name of ['math','mstyle']){
      const Base=originalNodeClasses[name];
      if(Base.defaults.scriptminsize!=='.4em') throw new Error('Unexpected v4 default script minimum');
      class OriginalScriptMinimum extends Base {}
      OriginalScriptMinimum.defaults={...Base.defaults,scriptminsize:'8px'};
      originalNodeClasses[name]=OriginalScriptMinimum;
    }
    if(typeof MmlFactory.prototype.nodeIsKind!=='function')throw new Error('Unexpected v4 node type checks');
    class OriginalMmlFactory extends MmlFactory {
      // Independent derived registrations must retain v4's original subtype
      // relationships (for example mover is also munderover).
      nodeIsKind(node,kind){
        const Original=MmlFactory.defaultNodes[kind];
        return Original && this.getNodeClass(kind)===originalNodeClasses[kind]?node instanceof Original:super.nodeIsKind(node,kind);
      }
    }
    OriginalMmlFactory.defaultNodes=originalNodeClasses;
    mathjax.config.options.MmlFactory=new OriginalMmlFactory();
    // v4 changed the order of applying the script minimum and mathsize.
    // Translate those parameters for every ordinary v4 output wrapper;
    // special wrappers (for example text nodes) retain their own methods.
    const outputNodes={...Factory.defaultNodes,mo:OriginalEmptyFenceSpacing,mtable:OriginalTableSpacing};
    for(const name of ['munder','mover','munderover']){
      const Base=outputNodes[name];
      if(typeof Base.prototype.stretchChildren!=='function')throw new Error('Unexpected v4 horizontal stretching API');
      outputNodes[name]=class extends Base {
        stretchChildren(){
          const stretchable=this.childNodes.filter(child=>child.canStretch('h'));
          if(!stretchable.length||this.childNodes.length<2)return;
          const all=stretchable.length>1&&stretchable.length===this.childNodes.length;
          let width=0;
          for(const child of this.childNodes){
            const fixed=child.stretch.dir==='';
            if(all||fixed){const box=child.getOuterBBox(fixed);width=Math.max(width,box.w*box.rscale);}
          }
          // Keep v4's delimiter lookup/drawing. The original font layout
          // restretched already-sized inner operators at the child scale.
          for(const child of stretchable)child.coreMO().getStretchedVariant([width/child.bbox.rscale]);
        }
      };
    }
    for(const [name,Base] of Object.entries(outputNodes)){
      if(Base.prototype.getScale!==commonScale) continue;
      outputNodes[name]=class extends Base {
        getScale(){
          super.getScale();
          const attributes=this.node.attributes;
          const level=Math.min(attributes.get('scriptlevel'),2);
          if(level===0)return;
          let size=this.node.isToken||this.node.isKind('mstyle')?attributes.get('mathsize'):attributes.getInherited('mathsize');
          const fontsize=attributes.get('fontsize')||this.removedStyles?.fontSize;
          if(fontsize&&!attributes.hasExplicit('mathsize'))size=fontsize;
          const minimum=this.length2em(attributes.get('scriptminsize'),.8,1);
          const scale=Math.max(Math.pow(attributes.get('scriptsizemultiplier'),level),minimum)*this.length2em(size,1,1);
          this.bbox.scale=scale;
          this.bbox.rscale=scale/(this.parent?this.parent.bbox.scale:1);
        }
      };
    }
    class OriginalSpacingFactory extends Factory {}
    OriginalSpacingFactory.defaultNodes=outputNodes;
    mathjax.config.svg.wrapperFactory=new OriginalSpacingFactory();
  }
  Object.defineProperty(globalThis,'ThreadShelfMathJaxCompatibility',{value:Object.freeze({install}),configurable:false,writable:false});
})();
