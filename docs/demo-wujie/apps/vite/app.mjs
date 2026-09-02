/**
* @vue/shared v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function Ae(t) {
  const e = /* @__PURE__ */ Object.create(null);
  for (const s of t.split(",")) e[s] = 1;
  return (s) => s in e;
}
const et = {}, Le = [], Ct = () => {
}, pr = () => !1, ze = (t) => t.charCodeAt(0) === 111 && t.charCodeAt(1) === 110 && // uppercase letter
(t.charCodeAt(2) > 122 || t.charCodeAt(2) < 97), ys = (t) => t.startsWith("onUpdate:"), pt = Object.assign, cn = (t, e) => {
  const s = t.indexOf(e);
  s > -1 && t.splice(s, 1);
}, Ci = Object.prototype.hasOwnProperty, J = (t, e) => Ci.call(t, e), j = Array.isArray, fe = (t) => Je(t) === "[object Map]", Ys = (t) => Je(t) === "[object Set]", Dn = (t) => Je(t) === "[object Date]", $ = (t) => typeof t == "function", st = (t) => typeof t == "string", se = (t) => typeof t == "symbol", nt = (t) => t !== null && typeof t == "object", gr = (t) => (nt(t) || $(t)) && $(t.then) && $(t.catch), Pi = Object.prototype.toString, Je = (t) => Pi.call(t), Mi = (t) => Je(t).slice(8, -1), Ii = (t) => Je(t) === "[object Object]", fn = (t) => st(t) && t !== "NaN" && t[0] !== "-" && "" + parseInt(t, 10) === t, ae = /* @__PURE__ */ Ae(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
), xs = (t) => {
  const e = /* @__PURE__ */ Object.create(null);
  return (s) => e[s] || (e[s] = t(s));
}, Ri = /-\w/g, Pt = xs(
  (t) => t.replace(Ri, (e) => e.slice(1).toUpperCase())
), Di = /\B([A-Z])/g, re = xs(
  (t) => t.replace(Di, "-$1").toLowerCase()
), _r = xs((t) => t.charAt(0).toUpperCase() + t.slice(1)), Ds = xs(
  (t) => t ? `on${_r(t)}` : ""
), Nt = (t, e) => !Object.is(t, e), Hs = (t, ...e) => {
  for (let s = 0; s < t.length; s++)
    t[s](...e);
}, Ee = (t, e, s, n = !1) => {
  Object.defineProperty(t, e, {
    configurable: !0,
    enumerable: !1,
    writable: n,
    value: s
  });
}, Hi = (t) => {
  const e = parseFloat(t);
  return isNaN(e) ? t : e;
};
let Hn;
const ue = () => Hn || (Hn = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {});
function vs(t) {
  if (j(t)) {
    const e = {};
    for (let s = 0; s < t.length; s++) {
      const n = t[s], r = st(n) ? Ui(n) : vs(n);
      if (r)
        for (const i in r)
          e[i] = r[i];
    }
    return e;
  } else if (st(t) || nt(t))
    return t;
}
const Vi = /;(?![^(]*\))/g, Li = /:([^]+)/, Ni = /\/\*[^]*?\*\//g;
function Ui(t) {
  const e = {};
  return t.replace(Ni, "").split(Vi).forEach((s) => {
    if (s) {
      const n = s.split(Li);
      n.length > 1 && (e[n[0].trim()] = n[1].trim());
    }
  }), e;
}
function Fi(t) {
  if (!t) return "";
  if (st(t)) return t;
  let e = "";
  for (const s in t) {
    const n = t[s];
    if (st(n) || typeof n == "number") {
      const r = s.startsWith("--") ? s : re(s);
      e += `${r}:${n};`;
    }
  }
  return e;
}
function Ts(t) {
  let e = "";
  if (st(t))
    e = t;
  else if (j(t))
    for (let s = 0; s < t.length; s++) {
      const n = Ts(t[s]);
      n && (e += n + " ");
    }
  else if (nt(t))
    for (const s in t)
      t[s] && (e += s + " ");
  return e.trim();
}
const mr = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", $i = /* @__PURE__ */ Ae(mr), Vn = /* @__PURE__ */ Ae(
  mr + ",async,autofocus,autoplay,controls,default,defer,disabled,inert,loop,open,required,reversed,scoped,seamless,checked,muted,multiple,selected"
);
function Es(t) {
  return !!t || t === "";
}
const ji = /* @__PURE__ */ Ae(
  "accept,accept-charset,accesskey,action,align,allow,alt,async,autocapitalize,autocomplete,autofocus,autoplay,background,bgcolor,border,buffered,capture,challenge,charset,checked,cite,class,code,codebase,color,cols,colspan,content,contenteditable,contextmenu,controls,coords,crossorigin,csp,data,datetime,decoding,default,defer,dir,dirname,disabled,download,draggable,dropzone,enctype,enterkeyhint,for,form,formaction,formenctype,formmethod,formnovalidate,formtarget,headers,height,hidden,high,href,hreflang,http-equiv,icon,id,importance,inert,integrity,ismap,itemprop,keytype,kind,label,lang,language,loading,list,loop,low,manifest,max,maxlength,minlength,media,min,multiple,muted,name,novalidate,open,optimum,pattern,ping,placeholder,poster,preload,radiogroup,readonly,referrerpolicy,rel,required,reversed,rows,rowspan,sandbox,scope,scoped,selected,shape,size,sizes,slot,span,spellcheck,src,srcdoc,srclang,srcset,start,step,style,summary,tabindex,target,title,translate,type,usemap,value,width,wrap"
), ki = /* @__PURE__ */ Ae(
  "xmlns,accent-height,accumulate,additive,alignment-baseline,alphabetic,amplitude,arabic-form,ascent,attributeName,attributeType,azimuth,baseFrequency,baseline-shift,baseProfile,bbox,begin,bias,by,calcMode,cap-height,class,clip,clipPathUnits,clip-path,clip-rule,color,color-interpolation,color-interpolation-filters,color-profile,color-rendering,contentScriptType,contentStyleType,crossorigin,cursor,cx,cy,d,decelerate,descent,diffuseConstant,direction,display,divisor,dominant-baseline,dur,dx,dy,edgeMode,elevation,enable-background,end,exponent,fill,fill-opacity,fill-rule,filter,filterRes,filterUnits,flood-color,flood-opacity,font-family,font-size,font-size-adjust,font-stretch,font-style,font-variant,font-weight,format,from,fr,fx,fy,g1,g2,glyph-name,glyph-orientation-horizontal,glyph-orientation-vertical,glyphRef,gradientTransform,gradientUnits,hanging,height,href,hreflang,horiz-adv-x,horiz-origin-x,id,ideographic,image-rendering,in,in2,intercept,k,k1,k2,k3,k4,kernelMatrix,kernelUnitLength,kerning,keyPoints,keySplines,keyTimes,lang,lengthAdjust,letter-spacing,lighting-color,limitingConeAngle,local,marker-end,marker-mid,marker-start,markerHeight,markerUnits,markerWidth,mask,maskContentUnits,maskUnits,mathematical,max,media,method,min,mode,name,numOctaves,offset,opacity,operator,order,orient,orientation,origin,overflow,overline-position,overline-thickness,panose-1,paint-order,path,pathLength,patternContentUnits,patternTransform,patternUnits,ping,pointer-events,points,pointsAtX,pointsAtY,pointsAtZ,preserveAlpha,preserveAspectRatio,primitiveUnits,r,radius,referrerPolicy,refX,refY,rel,rendering-intent,repeatCount,repeatDur,requiredExtensions,requiredFeatures,restart,result,rotate,rx,ry,scale,seed,shape-rendering,slope,spacing,specularConstant,specularExponent,speed,spreadMethod,startOffset,stdDeviation,stemh,stemv,stitchTiles,stop-color,stop-opacity,strikethrough-position,strikethrough-thickness,string,stroke,stroke-dasharray,stroke-dashoffset,stroke-linecap,stroke-linejoin,stroke-miterlimit,stroke-opacity,stroke-width,style,surfaceScale,systemLanguage,tabindex,tableValues,target,targetX,targetY,text-anchor,text-decoration,text-rendering,textLength,to,transform,transform-origin,type,u1,u2,underline-position,underline-thickness,unicode,unicode-bidi,unicode-range,units-per-em,v-alphabetic,v-hanging,v-ideographic,v-mathematical,values,vector-effect,version,vert-adv-y,vert-origin-x,vert-origin-y,viewBox,viewTarget,visibility,width,widths,word-spacing,writing-mode,x,x-height,x1,x2,xChannelSelector,xlink:actuate,xlink:arcrole,xlink:href,xlink:role,xlink:show,xlink:title,xlink:type,xmlns:xlink,xml:base,xml:lang,xml:space,y,y1,y2,yChannelSelector,z,zoomAndPan"
);
function br(t) {
  if (t == null)
    return !1;
  const e = typeof t;
  return e === "string" || e === "number" || e === "boolean";
}
const Ki = /[ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g;
function Bi(t, e) {
  return t.replace(
    Ki,
    (s) => `\\${s}`
  );
}
function Wi(t, e) {
  if (t.length !== e.length) return !1;
  let s = !0;
  for (let n = 0; s && n < t.length; n++)
    s = Ss(t[n], e[n]);
  return s;
}
function Ln(t, e) {
  if (t.size !== e.size) return !1;
  const s = Array.from(e), n = new Uint8Array(s.length);
  for (const r of t) {
    let i = -1;
    for (let l = 0; l < s.length; l++)
      if (!n[l] && Ss(r, s[l])) {
        i = l;
        break;
      }
    if (i < 0) return !1;
    n[i] = 1;
  }
  return !0;
}
function Ss(t, e) {
  if (t === e) return !0;
  let s = Dn(t), n = Dn(e);
  if (s || n)
    return s && n ? t.getTime() === e.getTime() : !1;
  if (s = se(t), n = se(e), s || n)
    return t === e;
  if (s = j(t), n = j(e), s || n)
    return s && n ? Wi(t, e) : !1;
  if (s = nt(t), n = nt(e), s || n) {
    if (!s || !n)
      return !1;
    if (s = fe(t), n = fe(e), s || n || (s = Ys(t), n = Ys(e), s || n))
      return s && n ? Ln(t, e) : !1;
    const r = Object.keys(t).length, i = Object.keys(e).length;
    if (r !== i)
      return !1;
    for (const l in t) {
      const o = t.hasOwnProperty(l), f = e.hasOwnProperty(l);
      if (o && !f || !o && f || !Ss(t[l], e[l]))
        return !1;
    }
  }
  return String(t) === String(e);
}
function Yi(t) {
  return t == null ? "initial" : typeof t == "string" ? t === "" ? " " : t : String(t);
}
/**
* @vue/reactivity v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let ht;
class qi {
  // TODO isolatedDeclarations "__v_skip"
  constructor(e = !1) {
    this.detached = e, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !e && ht && (ht.active ? (this.parent = ht, this.index = (ht.scopes || (ht.scopes = [])).push(
      this
    ) - 1) : (this._active = !1, this._warnOnRun = !1));
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = !0;
      let e, s;
      if (this.scopes) {
        const n = this.scopes.slice();
        for (e = 0, s = n.length; e < s; e++)
          n[e].pause();
      }
      for (e = 0, s = this.effects.length; e < s; e++)
        this.effects[e].pause();
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active && this._isPaused) {
      this._isPaused = !1;
      let e, s;
      if (this.scopes) {
        const r = this.scopes.slice();
        for (e = 0, s = r.length; e < s; e++)
          r[e].resume();
      }
      const n = this.effects.slice();
      for (e = 0, s = n.length; e < s; e++)
        n[e].resume();
    }
  }
  run(e) {
    if (this._active) {
      const s = ht;
      try {
        return ht = this, e();
      } finally {
        ht = s;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    ++this._on === 1 && (this.prevScope = ht, ht = this);
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (ht === this)
        ht = this.prevScope;
      else {
        let e = ht;
        for (; e; ) {
          if (e.prevScope === this) {
            e.prevScope = this.prevScope;
            break;
          }
          e = e.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(e) {
    if (this._active) {
      this._active = !1;
      let s, n;
      for (s = 0, n = this.effects.length; s < n; s++)
        this.effects[s].stop();
      for (this.effects.length = 0, s = 0, n = this.cleanups.length; s < n; s++)
        this.cleanups[s]();
      if (this.cleanups.length = 0, this.scopes) {
        const r = this.scopes.slice();
        for (s = 0, n = r.length; s < n; s++)
          r[s].stop(!0);
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !e) {
        const r = this.parent.scopes.pop();
        r && r !== this && (this.parent.scopes[this.index] = r, r.index = this.index);
      }
      this.parent = void 0;
    }
  }
}
function Gi() {
  return ht;
}
let tt;
const Vs = /* @__PURE__ */ new WeakSet();
class yr {
  constructor(e) {
    this.fn = e, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, ht && (ht.active ? ht.effects.push(this) : this.flags &= -2);
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    this.flags & 64 && (this.flags &= -65, Vs.has(this) && (Vs.delete(this), this.trigger()));
  }
  /**
   * @internal
   */
  notify() {
    this.flags & 2 && !(this.flags & 32) || this.flags & 8 || vr(this);
  }
  run() {
    if (!(this.flags & 1))
      return this.fn();
    this.flags |= 2, Nn(this), Tr(this);
    const e = tt, s = Mt;
    tt = this, Mt = !0;
    try {
      return this.fn();
    } finally {
      Er(this), tt = e, Mt = s, this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let e = this.deps; e; e = e.nextDep)
        hn(e);
      this.deps = this.depsTail = void 0, Nn(this), this.onStop && this.onStop(), this.flags &= -2;
    }
  }
  trigger() {
    this.flags & 64 ? Vs.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
  }
  /**
   * @internal
   */
  runIfDirty() {
    qs(this) && this.run();
  }
  get dirty() {
    return qs(this);
  }
}
let xr = 0, Ne, Ue;
function vr(t, e = !1) {
  if (t.flags |= 8, e) {
    t.next = Ue, Ue = t;
    return;
  }
  t.next = Ne, Ne = t;
}
function an() {
  xr++;
}
function un() {
  if (--xr > 0)
    return;
  if (Ue) {
    let e = Ue;
    for (Ue = void 0; e; ) {
      const s = e.next;
      e.next = void 0, e.flags &= -9, e = s;
    }
  }
  let t;
  for (; Ne; ) {
    let e = Ne;
    for (Ne = void 0; e; ) {
      const s = e.next;
      if (e.next = void 0, e.flags &= -9, e.flags & 1)
        try {
          e.trigger();
        } catch (n) {
          t || (t = n);
        }
      e = s;
    }
  }
  if (t) throw t;
}
function Tr(t) {
  for (let e = t.deps; e; e = e.nextDep)
    e.version = -1, e.prevActiveLink = e.dep.activeLink, e.dep.activeLink = e;
}
function Er(t) {
  let e, s = t.depsTail, n = s;
  for (; n; ) {
    const r = n.prevDep;
    n.version === -1 ? (n === s && (s = r), hn(n), zi(n)) : e = n, n.dep.activeLink = n.prevActiveLink, n.prevActiveLink = void 0, n = r;
  }
  t.deps = e, t.depsTail = s;
}
function qs(t) {
  for (let e = t.deps; e; e = e.nextDep)
    if (e.dep.version !== e.version || e.dep.computed && (Sr(e.dep.computed) || e.dep.version !== e.version))
      return !0;
  return !!t._dirty;
}
function Sr(t) {
  if (t.flags & 4 && !(t.flags & 16) || (t.flags &= -17, t.globalVersion === Ke) || (t.globalVersion = Ke, !t.isSSR && t.flags & 128 && (!t.deps && !t._dirty || !qs(t))))
    return;
  t.flags |= 2;
  const e = t.dep, s = tt, n = Mt;
  tt = t, Mt = !0;
  try {
    Tr(t);
    const r = t.fn(t._value);
    (e.version === 0 || Nt(r, t._value)) && (t.flags |= 128, t._value = r, e.version++);
  } catch (r) {
    throw e.version++, r;
  } finally {
    tt = s, Mt = n, Er(t), t.flags &= -3;
  }
}
function hn(t, e = !1) {
  const { dep: s, prevSub: n, nextSub: r } = t;
  if (n && (n.nextSub = r, t.prevSub = void 0), r && (r.prevSub = n, t.nextSub = void 0), s.subs === t && (s.subs = n, !n && s.computed)) {
    s.computed.flags &= -5;
    for (let i = s.computed.deps; i; i = i.nextDep)
      hn(i, !0);
  }
  !e && !--s.sc && s.map && s.map.delete(s.key);
}
function zi(t) {
  const { prevDep: e, nextDep: s } = t;
  e && (e.nextDep = s, t.prevDep = void 0), s && (s.prevDep = e, t.nextDep = void 0);
}
let Mt = !0;
const Ar = [];
function $t() {
  Ar.push(Mt), Mt = !1;
}
function jt() {
  const t = Ar.pop();
  Mt = t === void 0 ? !0 : t;
}
function Nn(t) {
  const { cleanup: e } = t;
  if (t.cleanup = void 0, e) {
    const s = tt;
    tt = void 0;
    try {
      e();
    } finally {
      tt = s;
    }
  }
}
let Ke = 0;
class Ji {
  constructor(e, s) {
    this.sub = e, this.dep = s, this.version = s.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class dn {
  // TODO isolatedDeclarations "__v_skip"
  constructor(e) {
    this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
  }
  track(e) {
    if (!tt || !Mt || tt === this.computed)
      return;
    let s = this.activeLink;
    if (s === void 0 || s.sub !== tt)
      s = this.activeLink = new Ji(tt, this), tt.deps ? (s.prevDep = tt.depsTail, tt.depsTail.nextDep = s, tt.depsTail = s) : tt.deps = tt.depsTail = s, Or(s);
    else if (s.version === -1 && (s.version = this.version, s.nextDep)) {
      const n = s.nextDep;
      n.prevDep = s.prevDep, s.prevDep && (s.prevDep.nextDep = n), s.prevDep = tt.depsTail, s.nextDep = void 0, tt.depsTail.nextDep = s, tt.depsTail = s, tt.deps === s && (tt.deps = n);
    }
    return s;
  }
  trigger(e) {
    this.version++, Ke++, this.notify(e);
  }
  notify(e) {
    an();
    try {
      for (let s = this.subs; s; s = s.prevSub)
        s.sub.notify() && s.sub.dep.notify();
    } finally {
      un();
    }
  }
}
function Or(t) {
  if (t.dep.sc++, t.sub.flags & 4) {
    const e = t.dep.computed;
    if (e && !t.dep.subs) {
      e.flags |= 20;
      for (let n = e.deps; n; n = n.nextDep)
        Or(n);
    }
    const s = t.dep.subs;
    s !== t && (t.prevSub = s, s && (s.nextSub = t)), t.dep.subs = t;
  }
}
const Gs = /* @__PURE__ */ new WeakMap(), he = /* @__PURE__ */ Symbol(
  ""
), zs = /* @__PURE__ */ Symbol(
  ""
), Be = /* @__PURE__ */ Symbol(
  ""
);
function gt(t, e, s) {
  if (Mt && tt) {
    let n = Gs.get(t);
    n || Gs.set(t, n = /* @__PURE__ */ new Map());
    let r = n.get(s);
    r || (n.set(s, r = new dn()), r.map = n, r.key = s), r.track();
  }
}
function Wt(t, e, s, n, r, i) {
  const l = Gs.get(t);
  if (!l) {
    Ke++;
    return;
  }
  const o = (f) => {
    f && f.trigger();
  };
  if (an(), e === "clear")
    l.forEach(o);
  else {
    const f = j(t), h = f && fn(s);
    if (f && s === "length") {
      const u = Number(n);
      l.forEach((g, T) => {
        (T === "length" || T === Be || !se(T) && T >= u) && o(g);
      });
    } else
      switch ((s !== void 0 || l.has(void 0)) && o(l.get(s)), h && o(l.get(Be)), e) {
        case "add":
          f ? h && o(l.get("length")) : (o(l.get(he)), fe(t) && o(l.get(zs)));
          break;
        case "delete":
          f || (o(l.get(he)), fe(t) && o(l.get(zs)));
          break;
        case "set":
          fe(t) && o(l.get(he));
          break;
      }
  }
  un();
}
function ge(t) {
  const e = /* @__PURE__ */ z(t);
  return e === t ? e : (gt(e, "iterate", Be), /* @__PURE__ */ It(t) ? e : e.map(Gt));
}
function pn(t) {
  return gt(t = /* @__PURE__ */ z(t), "iterate", Be), t;
}
function Lt(t, e) {
  return /* @__PURE__ */ ne(t) ? We(/* @__PURE__ */ de(t) ? Gt(e) : e) : Gt(e);
}
const Xi = {
  __proto__: null,
  [Symbol.iterator]() {
    return Ls(this, Symbol.iterator, (t) => Lt(this, t));
  },
  concat(...t) {
    return ge(this).concat(
      ...t.map((e) => j(e) ? ge(e) : e)
    );
  },
  entries() {
    return Ls(this, "entries", (t) => (t[1] = Lt(this, t[1]), t));
  },
  every(t, e) {
    return kt(this, "every", t, e, void 0, arguments);
  },
  filter(t, e) {
    return kt(
      this,
      "filter",
      t,
      e,
      (s) => s.map((n) => Lt(this, n)),
      arguments
    );
  },
  find(t, e) {
    return kt(
      this,
      "find",
      t,
      e,
      (s) => Lt(this, s),
      arguments
    );
  },
  findIndex(t, e) {
    return kt(this, "findIndex", t, e, void 0, arguments);
  },
  findLast(t, e) {
    return kt(
      this,
      "findLast",
      t,
      e,
      (s) => Lt(this, s),
      arguments
    );
  },
  findLastIndex(t, e) {
    return kt(this, "findLastIndex", t, e, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(t, e) {
    return kt(this, "forEach", t, e, void 0, arguments);
  },
  includes(...t) {
    return Ns(this, "includes", t);
  },
  indexOf(...t) {
    return Ns(this, "indexOf", t);
  },
  join(t) {
    return ge(this).join(t);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...t) {
    return Ns(this, "lastIndexOf", t);
  },
  map(t, e) {
    return kt(this, "map", t, e, void 0, arguments);
  },
  pop() {
    return Pe(this, "pop");
  },
  push(...t) {
    return Pe(this, "push", t);
  },
  reduce(t, ...e) {
    return Un(this, "reduce", t, e);
  },
  reduceRight(t, ...e) {
    return Un(this, "reduceRight", t, e);
  },
  shift() {
    return Pe(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(t, e) {
    return kt(this, "some", t, e, void 0, arguments);
  },
  splice(...t) {
    return Pe(this, "splice", t);
  },
  toReversed() {
    return ge(this).toReversed();
  },
  toSorted(t) {
    return ge(this).toSorted(t);
  },
  toSpliced(...t) {
    return ge(this).toSpliced(...t);
  },
  unshift(...t) {
    return Pe(this, "unshift", t);
  },
  values() {
    return Ls(this, "values", (t) => Lt(this, t));
  }
};
function Ls(t, e, s) {
  const n = pn(t), r = n[e]();
  return n !== t && !/* @__PURE__ */ It(t) && (r._next = r.next, r.next = () => {
    const i = r._next();
    return i.done || (i.value = s(i.value)), i;
  }), r;
}
const Zi = Array.prototype;
function kt(t, e, s, n, r, i) {
  const l = pn(t), o = l !== t && !/* @__PURE__ */ It(t), f = l[e];
  if (f !== Zi[e]) {
    const g = f.apply(t, i);
    return o ? Gt(g) : g;
  }
  let h = s;
  l !== t && (o ? h = function(g, T) {
    return s.call(this, Lt(t, g), T, t);
  } : s.length > 2 && (h = function(g, T) {
    return s.call(this, g, T, t);
  }));
  const u = f.call(l, h, n);
  return o && r ? r(u) : u;
}
function Un(t, e, s, n) {
  const r = pn(t), i = r !== t && !/* @__PURE__ */ It(t);
  let l = s, o = !1;
  r !== t && (i ? (o = n.length === 0, l = function(h, u, g) {
    return o && (o = !1, h = Lt(t, h)), s.call(this, h, Lt(t, u), g, t);
  }) : s.length > 3 && (l = function(h, u, g) {
    return s.call(this, h, u, g, t);
  }));
  const f = r[e](l, ...n);
  return o ? Lt(t, f) : f;
}
function Ns(t, e, s) {
  const n = /* @__PURE__ */ z(t);
  gt(n, "iterate", Be);
  const r = n[e](...s);
  return (r === -1 || r === !1) && /* @__PURE__ */ bn(s[0]) ? (s[0] = /* @__PURE__ */ z(s[0]), n[e](...s)) : r;
}
function Pe(t, e, s = []) {
  $t(), an();
  const n = (/* @__PURE__ */ z(t))[e].apply(t, s);
  return un(), jt(), n;
}
const Qi = /* @__PURE__ */ Ae("__proto__,__v_isRef,__isVue"), wr = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((t) => t !== "arguments" && t !== "caller").map((t) => Symbol[t]).filter(se)
);
function tl(t) {
  se(t) || (t = String(t));
  const e = /* @__PURE__ */ z(this);
  return gt(e, "has", t), e.hasOwnProperty(t);
}
class Cr {
  constructor(e = !1, s = !1) {
    this._isReadonly = e, this._isShallow = s;
  }
  get(e, s, n) {
    if (s === "__v_skip") return e.__v_skip;
    const r = this._isReadonly, i = this._isShallow;
    if (s === "__v_isReactive")
      return !r;
    if (s === "__v_isReadonly")
      return r;
    if (s === "__v_isShallow")
      return i;
    if (s === "__v_raw")
      return n === (r ? i ? al : Rr : i ? Ir : Mr).get(e) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0;
    const l = j(e);
    if (!r) {
      let f;
      if (l && (f = Xi[s]))
        return f;
      if (s === "hasOwnProperty")
        return tl;
    }
    const o = Reflect.get(
      e,
      s,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ dt(e) ? e : n
    );
    if ((se(s) ? wr.has(s) : Qi(s)) || (r || gt(e, "get", s), i))
      return o;
    if (/* @__PURE__ */ dt(o)) {
      const f = l && fn(s) ? o : o.value;
      return r && nt(f) ? /* @__PURE__ */ Xs(f) : f;
    }
    return nt(o) ? r ? /* @__PURE__ */ Xs(o) : /* @__PURE__ */ _n(o) : o;
  }
}
class Pr extends Cr {
  constructor(e = !1) {
    super(!1, e);
  }
  set(e, s, n, r) {
    let i = e[s];
    const l = j(e) && fn(s);
    if (!this._isShallow) {
      const h = /* @__PURE__ */ ne(i);
      if (!/* @__PURE__ */ It(n) && !/* @__PURE__ */ ne(n) && (i = /* @__PURE__ */ z(i), n = /* @__PURE__ */ z(n)), !l && /* @__PURE__ */ dt(i) && !/* @__PURE__ */ dt(n))
        return h || (i.value = n), !0;
    }
    const o = l ? Number(s) < e.length : J(e, s), f = Reflect.set(
      e,
      s,
      n,
      /* @__PURE__ */ dt(e) ? e : r
    );
    return e === /* @__PURE__ */ z(r) && f && (o ? Nt(n, i) && Wt(e, "set", s, n) : Wt(e, "add", s, n)), f;
  }
  deleteProperty(e, s) {
    const n = J(e, s);
    e[s];
    const r = Reflect.deleteProperty(e, s);
    return r && n && Wt(e, "delete", s, void 0), r;
  }
  has(e, s) {
    const n = Reflect.has(e, s);
    return (!se(s) || !wr.has(s)) && gt(e, "has", s), n;
  }
  ownKeys(e) {
    return gt(
      e,
      "iterate",
      j(e) ? "length" : he
    ), Reflect.ownKeys(e);
  }
}
class el extends Cr {
  constructor(e = !1) {
    super(!0, e);
  }
  set(e, s) {
    return !0;
  }
  deleteProperty(e, s) {
    return !0;
  }
}
const sl = /* @__PURE__ */ new Pr(), nl = /* @__PURE__ */ new el(), rl = /* @__PURE__ */ new Pr(!0);
const Js = (t) => t, ts = (t) => Reflect.getPrototypeOf(t);
function il(t, e, s) {
  return function(...n) {
    const r = this.__v_raw, i = /* @__PURE__ */ z(r), l = fe(i), o = t === "entries" || t === Symbol.iterator && l, f = t === "keys" && l, h = r[t](...n), u = s ? Js : e ? We : Gt;
    return !e && gt(
      i,
      "iterate",
      f ? zs : he
    ), pt(
      // inheriting all iterator properties
      Object.create(h),
      {
        // iterator protocol
        next() {
          const { value: g, done: T } = h.next();
          return T ? { value: g, done: T } : {
            value: o ? [u(g[0]), u(g[1])] : u(g),
            done: T
          };
        }
      }
    );
  };
}
function es(t) {
  return function(...e) {
    return t === "delete" ? !1 : t === "clear" ? void 0 : this;
  };
}
function ll(t, e) {
  const s = {
    get(r) {
      const i = this.__v_raw, l = /* @__PURE__ */ z(i), o = /* @__PURE__ */ z(r);
      t || (Nt(r, o) && gt(l, "get", r), gt(l, "get", o));
      const { has: f } = ts(l), h = e ? Js : t ? We : Gt;
      if (f.call(l, r))
        return h(i.get(r));
      if (f.call(l, o))
        return h(i.get(o));
      i !== l && i.get(r);
    },
    get size() {
      const r = this.__v_raw;
      return !t && gt(/* @__PURE__ */ z(r), "iterate", he), r.size;
    },
    has(r) {
      const i = this.__v_raw, l = /* @__PURE__ */ z(i), o = /* @__PURE__ */ z(r);
      return t || (Nt(r, o) && gt(l, "has", r), gt(l, "has", o)), r === o ? i.has(r) : i.has(r) || i.has(o);
    },
    forEach(r, i) {
      const l = this, o = l.__v_raw, f = /* @__PURE__ */ z(o), h = e ? Js : t ? We : Gt;
      return !t && gt(f, "iterate", he), o.forEach((u, g) => r.call(i, h(u), h(g), l));
    }
  };
  return pt(
    s,
    t ? {
      add: es("add"),
      set: es("set"),
      delete: es("delete"),
      clear: es("clear")
    } : {
      add(r) {
        const i = /* @__PURE__ */ z(this), l = ts(i), o = /* @__PURE__ */ z(r), f = !e && !/* @__PURE__ */ It(r) && !/* @__PURE__ */ ne(r) ? o : r;
        return l.has.call(i, f) || Nt(r, f) && l.has.call(i, r) || Nt(o, f) && l.has.call(i, o) || (i.add(f), Wt(i, "add", f, f)), this;
      },
      set(r, i) {
        !e && !/* @__PURE__ */ It(i) && !/* @__PURE__ */ ne(i) && (i = /* @__PURE__ */ z(i));
        const l = /* @__PURE__ */ z(this), { has: o, get: f } = ts(l);
        let h = o.call(l, r);
        h || (r = /* @__PURE__ */ z(r), h = o.call(l, r));
        const u = f.call(l, r);
        return l.set(r, i), h ? Nt(i, u) && Wt(l, "set", r, i) : Wt(l, "add", r, i), this;
      },
      delete(r) {
        const i = /* @__PURE__ */ z(this), { has: l, get: o } = ts(i);
        let f = l.call(i, r);
        f || (r = /* @__PURE__ */ z(r), f = l.call(i, r)), o && o.call(i, r);
        const h = i.delete(r);
        return f && Wt(i, "delete", r, void 0), h;
      },
      clear() {
        const r = /* @__PURE__ */ z(this), i = r.size !== 0, l = r.clear();
        return i && Wt(
          r,
          "clear",
          void 0,
          void 0
        ), l;
      }
    }
  ), [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ].forEach((r) => {
    s[r] = il(r, t, e);
  }), s;
}
function gn(t, e) {
  const s = ll(t, e);
  return (n, r, i) => r === "__v_isReactive" ? !t : r === "__v_isReadonly" ? t : r === "__v_raw" ? n : Reflect.get(
    J(s, r) && r in n ? s : n,
    r,
    i
  );
}
const ol = {
  get: /* @__PURE__ */ gn(!1, !1)
}, cl = {
  get: /* @__PURE__ */ gn(!1, !0)
}, fl = {
  get: /* @__PURE__ */ gn(!0, !1)
};
const Mr = /* @__PURE__ */ new WeakMap(), Ir = /* @__PURE__ */ new WeakMap(), Rr = /* @__PURE__ */ new WeakMap(), al = /* @__PURE__ */ new WeakMap();
function ul(t) {
  switch (t) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
// @__NO_SIDE_EFFECTS__
function _n(t) {
  return /* @__PURE__ */ ne(t) ? t : mn(
    t,
    !1,
    sl,
    ol,
    Mr
  );
}
// @__NO_SIDE_EFFECTS__
function hl(t) {
  return mn(
    t,
    !1,
    rl,
    cl,
    Ir
  );
}
// @__NO_SIDE_EFFECTS__
function Xs(t) {
  return mn(
    t,
    !0,
    nl,
    fl,
    Rr
  );
}
function mn(t, e, s, n, r) {
  if (!nt(t) || t.__v_raw && !(e && t.__v_isReactive) || t.__v_skip || !Object.isExtensible(t))
    return t;
  const i = r.get(t);
  if (i)
    return i;
  const l = ul(Mi(t));
  if (l === 0)
    return t;
  const o = new Proxy(
    t,
    l === 2 ? n : s
  );
  return r.set(t, o), o;
}
// @__NO_SIDE_EFFECTS__
function de(t) {
  return /* @__PURE__ */ ne(t) ? /* @__PURE__ */ de(t.__v_raw) : !!(t && t.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function ne(t) {
  return !!(t && t.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function It(t) {
  return !!(t && t.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function bn(t) {
  return t ? !!t.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function z(t) {
  const e = t && t.__v_raw;
  return e ? /* @__PURE__ */ z(e) : t;
}
function dl(t) {
  return !J(t, "__v_skip") && Object.isExtensible(t) && Ee(t, "__v_skip", !0), t;
}
const Gt = (t) => nt(t) ? /* @__PURE__ */ _n(t) : t, We = (t) => nt(t) ? /* @__PURE__ */ Xs(t) : t;
// @__NO_SIDE_EFFECTS__
function dt(t) {
  return t ? t.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function Dr(t) {
  return pl(t, !1);
}
function pl(t, e) {
  return /* @__PURE__ */ dt(t) ? t : new gl(t, e);
}
class gl {
  constructor(e, s) {
    this.dep = new dn(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = s ? e : /* @__PURE__ */ z(e), this._value = s ? e : Gt(e), this.__v_isShallow = s;
  }
  get value() {
    return this.dep.track(), this._value;
  }
  set value(e) {
    const s = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ It(e) || /* @__PURE__ */ ne(e);
    e = n ? e : /* @__PURE__ */ z(e), Nt(e, s) && (this._rawValue = e, this._value = n ? e : Gt(e), this.dep.trigger());
  }
}
function _l(t) {
  return /* @__PURE__ */ dt(t) ? t.value : t;
}
const ml = {
  get: (t, e, s) => e === "__v_raw" ? t : _l(Reflect.get(t, e, s)),
  set: (t, e, s, n) => {
    const r = t[e];
    return /* @__PURE__ */ dt(r) && !/* @__PURE__ */ dt(s) ? (r.value = s, !0) : Reflect.set(t, e, s, n);
  }
};
function Hr(t) {
  return /* @__PURE__ */ de(t) ? t : new Proxy(t, ml);
}
class bl {
  constructor(e, s, n) {
    this.fn = e, this.setter = s, this._value = void 0, this.dep = new dn(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = Ke - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !s, this.isSSR = n;
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags |= 16, !(this.flags & 8) && // avoid infinite self recursion
    tt !== this)
      return vr(this, !0), !0;
  }
  get value() {
    const e = this.dep.track();
    return Sr(this), e && (e.version = this.dep.version), this._value;
  }
  set value(e) {
    this.setter && this.setter(e);
  }
}
// @__NO_SIDE_EFFECTS__
function yl(t, e, s = !1) {
  let n, r;
  return $(t) ? n = t : (n = t.get, r = t.set), new bl(n, r, s);
}
const ss = {}, cs = /* @__PURE__ */ new WeakMap();
let oe;
function xl(t, e = !1, s = oe) {
  if (s) {
    let n = cs.get(s);
    n || cs.set(s, n = []), n.push(t);
  }
}
function vl(t, e, s = et) {
  const { immediate: n, deep: r, once: i, scheduler: l, augmentJob: o, call: f } = s, h = (_) => r ? _ : /* @__PURE__ */ It(_) || r === !1 || r === 0 ? te(_, 1) : te(_);
  let u, g, T, A, V = !1, P = !1;
  if (/* @__PURE__ */ dt(t) ? (g = () => t.value, V = /* @__PURE__ */ It(t)) : /* @__PURE__ */ de(t) ? (g = () => h(t), V = !0) : j(t) ? (P = !0, V = t.some((_) => /* @__PURE__ */ de(_) || /* @__PURE__ */ It(_)), g = () => t.map((_) => {
    if (/* @__PURE__ */ dt(_))
      return _.value;
    if (/* @__PURE__ */ de(_))
      return h(_);
    if ($(_))
      return f ? f(_, 2) : _();
  })) : $(t) ? e ? g = f ? () => f(t, 2) : t : g = () => {
    if (T) {
      $t();
      try {
        T();
      } finally {
        jt();
      }
    }
    const _ = oe;
    oe = u;
    try {
      return f ? f(t, 3, [A]) : t(A);
    } finally {
      oe = _;
    }
  } : g = Ct, e && r) {
    const _ = g, w = r === !0 ? 1 / 0 : r;
    g = () => te(_(), w);
  }
  const K = Gi(), W = () => {
    u.stop(), K && K.active && cn(K.effects, u);
  };
  if (i && e) {
    const _ = e;
    e = (...w) => {
      const B = _(...w);
      return W(), B;
    };
  }
  let I = P ? new Array(t.length).fill(ss) : ss;
  const d = (_) => {
    if (!(!(u.flags & 1) || !u.dirty && !_))
      if (e) {
        const w = u.run();
        if (_ || r || V || (P ? w.some((B, C) => Nt(B, I[C])) : Nt(w, I))) {
          T && T();
          const B = oe;
          oe = u;
          try {
            const C = [
              w,
              // pass undefined as the old value when it's changed for the first time
              I === ss ? void 0 : P && I[0] === ss ? [] : I,
              A
            ];
            I = w, f ? f(e, 3, C) : (
              // @ts-expect-error
              e(...C)
            );
          } finally {
            oe = B;
          }
        }
      } else
        u.run();
  };
  return o && o(d), u = new yr(g), u.scheduler = l ? () => l(d, !1) : d, A = (_) => xl(_, !1, u), T = u.onStop = () => {
    const _ = cs.get(u);
    if (_) {
      if (f)
        f(_, 4);
      else
        for (const w of _) w();
      cs.delete(u);
    }
  }, e ? n ? d(!0) : I = u.run() : l ? l(d.bind(null, !0), !0) : u.run(), W.pause = u.pause.bind(u), W.resume = u.resume.bind(u), W.stop = W, W;
}
function te(t, e = 1 / 0, s) {
  if (e <= 0 || !nt(t) || t.__v_skip || (s = s || /* @__PURE__ */ new Map(), (s.get(t) || 0) >= e))
    return t;
  if (s.set(t, e), e--, /* @__PURE__ */ dt(t))
    te(t.value, e, s);
  else if (j(t))
    for (let n = 0; n < t.length; n++)
      te(t[n], e, s);
  else if (Ys(t) || fe(t))
    t.forEach((n) => {
      te(n, e, s);
    });
  else if (Ii(t)) {
    for (const n in t)
      te(t[n], e, s);
    for (const n of Object.getOwnPropertySymbols(t))
      Object.prototype.propertyIsEnumerable.call(t, n) && te(t[n], e, s);
  }
  return t;
}
/**
* @vue/runtime-core v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const Fe = [];
let Us = !1;
function Xt(t, ...e) {
  if (Us) return;
  Us = !0, $t();
  const s = Fe.length ? Fe[Fe.length - 1].component : null, n = s && s.appContext.config.warnHandler, r = Tl();
  if (n)
    Oe(
      n,
      s,
      11,
      [
        // eslint-disable-next-line no-restricted-syntax
        t + e.map((i) => {
          var l, o;
          return (o = (l = i.toString) == null ? void 0 : l.call(i)) != null ? o : JSON.stringify(i);
        }).join(""),
        s && s.proxy,
        r.map(
          ({ vnode: i }) => `at <${vi(s, i.type)}>`
        ).join(`
`),
        r
      ]
    );
  else {
    const i = [`[Vue warn]: ${t}`, ...e];
    r.length && i.push(`
`, ...El(r)), console.warn(...i);
  }
  jt(), Us = !1;
}
function Tl() {
  let t = Fe[Fe.length - 1];
  if (!t)
    return [];
  const e = [];
  for (; t; ) {
    const s = e[0];
    s && s.vnode === t ? s.recurseCount++ : e.push({
      vnode: t,
      recurseCount: 0
    });
    const n = t.component && t.component.parent;
    t = n && n.vnode;
  }
  return e;
}
function El(t) {
  const e = [];
  return t.forEach((s, n) => {
    e.push(...n === 0 ? [] : [`
`], ...Sl(s));
  }), e;
}
function Sl({ vnode: t, recurseCount: e }) {
  const s = e > 0 ? `... (${e} recursive calls)` : "", n = t.component ? t.component.parent == null : !1, r = ` at <${vi(
    t.component,
    t.type,
    n
  )}`, i = ">" + s;
  return t.props ? [r, ...Al(t.props), i] : [r + i];
}
function Al(t) {
  const e = [], s = Object.keys(t);
  return s.slice(0, 3).forEach((n) => {
    e.push(...Vr(n, t[n]));
  }), s.length > 3 && e.push(" ..."), e;
}
function Vr(t, e, s) {
  return st(e) ? (e = JSON.stringify(e), s ? e : [`${t}=${e}`]) : typeof e == "number" || typeof e == "boolean" || e == null ? s ? e : [`${t}=${e}`] : /* @__PURE__ */ dt(e) ? (e = Vr(t, /* @__PURE__ */ z(e.value), !0), s ? e : [`${t}=Ref<`, e, ">"]) : $(e) ? [`${t}=fn${e.name ? `<${e.name}>` : ""}`] : (e = /* @__PURE__ */ z(e), s ? e : [`${t}=`, e]);
}
function Oe(t, e, s, n) {
  try {
    return n ? t(...n) : t();
  } catch (r) {
    As(r, e, s);
  }
}
function Rt(t, e, s, n) {
  if ($(t)) {
    const r = Oe(t, e, s, n);
    return r && gr(r) && r.catch((i) => {
      As(i, e, s);
    }), r;
  }
  if (j(t)) {
    const r = [];
    for (let i = 0; i < t.length; i++)
      r.push(Rt(t[i], e, s, n));
    return r;
  }
}
function As(t, e, s, n = !0) {
  const r = e ? e.vnode : null, { errorHandler: i, throwUnhandledErrorInProduction: l } = e && e.appContext.config || et;
  if (e) {
    let o = e.parent;
    const f = e.proxy, h = `https://vuejs.org/error-reference/#runtime-${s}`;
    for (; o; ) {
      const u = o.ec;
      if (u) {
        for (let g = 0; g < u.length; g++)
          if (u[g](t, f, h) === !1)
            return;
      }
      o = o.parent;
    }
    if (i) {
      $t(), Oe(i, null, 10, [
        t,
        f,
        h
      ]), jt();
      return;
    }
  }
  Ol(t, s, r, n, l);
}
function Ol(t, e, s, n = !0, r = !1) {
  if (r)
    throw t;
  console.error(t);
}
const bt = [];
let Ht = -1;
const me = [];
let Qt = null, _e = 0;
const Lr = /* @__PURE__ */ Promise.resolve();
let fs = null;
function wl(t) {
  const e = fs || Lr;
  return t ? e.then(this ? t.bind(this) : t) : e;
}
function Cl(t) {
  let e = Ht + 1, s = bt.length;
  for (; e < s; ) {
    const n = e + s >>> 1, r = bt[n], i = Ye(r);
    i < t || i === t && r.flags & 2 ? e = n + 1 : s = n;
  }
  return e;
}
function yn(t) {
  if (!(t.flags & 1)) {
    const e = Ye(t), s = bt[bt.length - 1];
    !s || // fast path when the job id is larger than the tail
    !(t.flags & 2) && e >= Ye(s) ? bt.push(t) : bt.splice(Cl(e), 0, t), t.flags |= 1, Nr();
  }
}
function Nr() {
  fs || (fs = Lr.then(Ur));
}
function Pl(t) {
  if (!j(t))
    Qt && t.id === -1 ? Qt.splice(_e + 1, 0, t) : t.flags & 1 || (me.push(t), t.flags |= 1);
  else
    for (let e = 0; e < t.length; e++)
      me.push(t[e]);
  Nr();
}
function Fn(t, e, s = Ht + 1) {
  for (; s < bt.length; s++) {
    const n = bt[s];
    if (n && n.flags & 2) {
      if (t && n.id !== t.uid)
        continue;
      bt.splice(s, 1), s--, n.flags & 4 && (n.flags &= -2), n(), n.flags & 4 || (n.flags &= -2);
    }
  }
}
function as(t) {
  if (me.length) {
    const e = [...new Set(me)].sort(
      (s, n) => Ye(s) - Ye(n)
    );
    if (me.length = 0, Qt) {
      for (let s = 0; s < e.length; s++)
        Qt.push(e[s]);
      return;
    }
    for (Qt = e, _e = 0; _e < Qt.length; _e++) {
      const s = Qt[_e];
      s.flags & 4 && (s.flags &= -2), s.flags & 8 || s(), s.flags &= -2;
    }
    Qt = null, _e = 0;
  }
}
const Ye = (t) => t.id == null ? t.flags & 2 ? -1 : 1 / 0 : t.id;
function Ur(t) {
  try {
    for (Ht = 0; Ht < bt.length; Ht++) {
      const e = bt[Ht];
      e && !(e.flags & 8) && (e.flags & 4 && (e.flags &= -2), Oe(
        e,
        e.i,
        e.i ? 15 : 14
      ), e.flags & 4 || (e.flags &= -2));
    }
  } finally {
    for (; Ht < bt.length; Ht++) {
      const e = bt[Ht];
      e && (e.flags &= -2);
    }
    Ht = -1, bt.length = 0, as(), fs = null, (bt.length || me.length) && Ur();
  }
}
let Ut, Re = [], Zs = !1;
function Os(t, ...e) {
  Ut ? Ut.emit(t, ...e) : Zs || Re.push({ event: t, args: e });
}
function Fr(t, e) {
  var s, n;
  Ut = t, Ut ? (Ut.enabled = !0, Re.forEach(({ event: r, args: i }) => Ut.emit(r, ...i)), Re = []) : /* handle late devtools injection - only do this if we are in an actual */ /* browser environment to avoid the timer handle stalling test runner exit */ /* (#4815) */ typeof window < "u" && // some envs mock window but not fully
  window.HTMLElement && // also exclude jsdom
  // eslint-disable-next-line no-restricted-syntax
  !((n = (s = window.navigator) == null ? void 0 : s.userAgent) != null && n.includes("jsdom")) ? ((e.__VUE_DEVTOOLS_HOOK_REPLAY__ = e.__VUE_DEVTOOLS_HOOK_REPLAY__ || []).push((i) => {
    Fr(i, e);
  }), setTimeout(() => {
    Ut || (e.__VUE_DEVTOOLS_HOOK_REPLAY__ = null, Zs = !0, Re = []);
  }, 3e3)) : (Zs = !0, Re = []);
}
function Ml(t, e) {
  Os("app:init", t, e, {
    Fragment: At,
    Text: ee,
    Comment: zt,
    Static: ve
  });
}
function Il(t) {
  Os("app:unmount", t);
}
const Rl = /* @__PURE__ */ xn(
  "component:added"
  /* COMPONENT_ADDED */
), $r = /* @__PURE__ */ xn(
  "component:updated"
  /* COMPONENT_UPDATED */
), Dl = /* @__PURE__ */ xn(
  "component:removed"
  /* COMPONENT_REMOVED */
), Hl = (t) => {
  Ut && typeof Ut.cleanupBuffer == "function" && // remove the component if it wasn't buffered
  !Ut.cleanupBuffer(t) && Dl(t);
};
// @__NO_SIDE_EFFECTS__
function xn(t) {
  return (e) => {
    Os(
      t,
      e.appContext.app,
      e.uid,
      e.parent ? e.parent.uid : void 0,
      e
    );
  };
}
function Vl(t, e, s) {
  Os(
    "component:emit",
    t.appContext.app,
    t,
    e,
    s
  );
}
let Ft = null, jr = null;
function us(t) {
  const e = Ft;
  return Ft = t, jr = t && t.type.__scopeId || null, e;
}
function Ll(t, e = Ft, s) {
  if (!e || t._n)
    return t;
  const n = (...r) => {
    n._d && gs(-1);
    const i = us(e), l = Te.length;
    let o;
    try {
      o = t(...r);
    } finally {
      for (let f = Te.length; f > l; f--) ko();
      us(i), n._d && gs(1);
    }
    return __VUE_PROD_DEVTOOLS__ && $r(e), o;
  };
  return n._n = !0, n._c = !0, n._d = !0, n;
}
function Vt(t, e, s, n) {
  const r = t.dirs, i = e && e.dirs;
  for (let l = 0; l < r.length; l++) {
    const o = r[l];
    i && (o.oldValue = i[l].value);
    let f = o.dir[n];
    f && ($t(), Rt(f, s, 8, [
      t.el,
      o,
      t,
      e
    ]), jt());
  }
}
function Nl(t, e) {
  if (yt) {
    let s = yt.provides;
    const n = yt.parent && yt.parent.provides;
    n === s && (s = yt.provides = Object.create(n)), s[t] = e;
  }
}
function ls(t, e, s = !1) {
  const n = Jo();
  if (n || xe) {
    let r = xe ? xe._context.provides : n ? n.parent == null || n.ce ? n.vnode.appContext && n.vnode.appContext.provides : n.parent.provides : void 0;
    if (r && t in r)
      return r[t];
    if (arguments.length > 1)
      return s && $(e) ? e.call(n && n.proxy) : e;
  }
}
const Ul = /* @__PURE__ */ Symbol.for("v-scx"), Fl = () => ls(Ul);
function Fs(t, e, s) {
  return kr(t, e, s);
}
function kr(t, e, s = et) {
  const { immediate: n, deep: r, flush: i, once: l } = s, o = pt({}, s), f = e && n || !e && i !== "post";
  let h;
  if (Ge) {
    if (i === "sync") {
      const A = Fl();
      h = A.__watcherHandles || (A.__watcherHandles = []);
    } else if (!f) {
      const A = () => {
      };
      return A.stop = Ct, A.resume = Ct, A.pause = Ct, A;
    }
  }
  const u = yt;
  o.call = (A, V, P) => Rt(A, u, V, P);
  let g = !1;
  i === "post" ? o.scheduler = (A) => {
    mt(A, u && u.suspense);
  } : i !== "sync" && (g = !0, o.scheduler = (A, V) => {
    V ? A() : yn(A);
  }), o.augmentJob = (A) => {
    e && (A.flags |= 4), g && (A.flags |= 2, u && (A.id = u.uid, A.i = u));
  };
  const T = vl(t, e, o);
  return Ge && (h ? h.push(T) : f && T()), T;
}
function $l(t, e, s) {
  const n = this.proxy, r = st(t) ? t.includes(".") ? Kr(n, t) : () => n[t] : t.bind(n, n);
  let i;
  $(e) ? i = e : (i = e.handler, s = e);
  const l = Xe(this), o = kr(r, i.bind(n), s);
  return l(), o;
}
function Kr(t, e) {
  const s = e.split(".");
  return () => {
    let n = t;
    for (let r = 0; r < s.length && n; r++)
      n = n[s[r]];
    return n;
  };
}
const Zt = /* @__PURE__ */ new WeakMap(), Br = /* @__PURE__ */ Symbol("_vte"), ws = (t) => t.__isTeleport, ce = (t) => t && (t.disabled || t.disabled === ""), jl = (t) => t && (t.defer || t.defer === ""), $n = (t) => typeof SVGElement < "u" && t instanceof SVGElement, jn = (t) => typeof MathMLElement == "function" && t instanceof MathMLElement, Qs = (t, e) => {
  const s = t && t.to;
  return st(s) ? e ? e(s) : null : s;
}, kl = {
  name: "Teleport",
  __isTeleport: !0,
  process(t, e, s, n, r, i, l, o, f, h) {
    const {
      mc: u,
      pc: g,
      pbc: T,
      o: { insert: A, querySelector: V, createText: P, createComment: K, parentNode: W }
    } = h, I = ce(e.props);
    let { dynamicChildren: d } = e;
    const _ = (C, F, L) => {
      C.shapeFlag & 16 && u(
        C.children,
        F,
        L,
        r,
        i,
        l,
        o,
        f
      );
    }, w = (C = e) => {
      const F = ce(C.props), L = C.target = Qs(C.props, V), Y = tn(L, C, P, A);
      L && (l !== "svg" && $n(L) ? l = "svg" : l !== "mathml" && jn(L) && (l = "mathml"), r && r.isCE && (r.ce._teleportTargets || (r.ce._teleportTargets = /* @__PURE__ */ new Set())).add(L), F || (_(C, L, Y), De(C, !1)));
    }, B = (C) => {
      const F = () => {
        if (Zt.get(C) === F) {
          if (Zt.delete(C), ce(C.props)) {
            const L = W(C.el) || s;
            _(C, L, C.anchor), De(C, !0);
          }
          w(C);
        }
      };
      Zt.set(C, F), mt(F, i);
    };
    if (t == null) {
      const C = e.el = P(""), F = e.anchor = P("");
      if (A(C, s, n), A(F, s, n), jl(e.props) || i && i.pendingBranch) {
        B(e);
        return;
      }
      I && (_(e, s, F), De(e, !0)), w();
    } else {
      e.el = t.el;
      const C = e.anchor = t.anchor, F = Zt.get(t);
      if (F) {
        F.flags |= 8, Zt.delete(t), B(e);
        return;
      }
      e.targetStart = t.targetStart;
      const L = e.target = t.target, Y = e.targetAnchor = t.targetAnchor, N = ce(t.props), ot = N ? s : L, lt = N ? C : Y;
      if (l === "svg" || $n(L) ? l = "svg" : (l === "mathml" || jn(L)) && (l = "mathml"), d ? (T(
        t.dynamicChildren,
        d,
        ot,
        r,
        i,
        l,
        o
      ), On(t, e, !0)) : f || g(
        t,
        e,
        ot,
        lt,
        r,
        i,
        l,
        o,
        !1
      ), I)
        N ? e.props && t.props && e.props.to !== t.props.to && (e.props.to = t.props.to) : ns(
          e,
          s,
          C,
          h,
          1
        );
      else if ((e.props && e.props.to) !== (t.props && t.props.to)) {
        const rt = Qs(e.props, V);
        rt && (e.target = rt, ns(
          e,
          rt,
          null,
          h,
          0
        ));
      } else N && ns(
        e,
        L,
        Y,
        h,
        1
      );
      De(e, I);
    }
  },
  remove(t, e, s, { um: n, o: { remove: r } }, i) {
    const {
      shapeFlag: l,
      children: o,
      anchor: f,
      targetStart: h,
      targetAnchor: u,
      target: g,
      props: T
    } = t, A = ce(T), V = i || !A, P = Zt.get(t);
    if (P && (P.flags |= 8, Zt.delete(t)), g && (r(h), r(u)), i && r(f), !P && (A || g) && l & 16)
      for (let K = 0; K < o.length; K++) {
        const W = o[K];
        n(
          W,
          e,
          s,
          V,
          !!W.dynamicChildren
        );
      }
  },
  move: ns,
  hydrate: Kl
};
function ns(t, e, s, { o: { insert: n }, m: r }, i = 2) {
  i === 0 && n(t.targetAnchor, e, s);
  const { el: l, anchor: o, shapeFlag: f, children: h, props: u } = t, g = i === 2;
  if (g && n(l, e, s), !Zt.has(t) && (!g || ce(u)) && f & 16)
    for (let T = 0; T < h.length; T++)
      r(
        h[T],
        e,
        s,
        2
      );
  g && n(o, e, s);
}
function Kl(t, e, s, n, r, i, {
  o: { nextSibling: l, parentNode: o, querySelector: f, insert: h, createText: u }
}, g) {
  function T(K, W) {
    let I = W;
    for (; I; ) {
      if (I && I.nodeType === 8) {
        if (I.data === "teleport start anchor")
          e.targetStart = I;
        else if (I.data === "teleport anchor") {
          e.targetAnchor = I, K._lpa = e.targetAnchor && l(e.targetAnchor);
          break;
        }
      }
      I = l(I);
    }
  }
  function A(K, W) {
    W.anchor = g(
      l(K),
      W,
      o(K),
      s,
      n,
      r,
      i
    );
  }
  const V = e.target = Qs(
    e.props,
    f
  ), P = ce(e.props);
  if (V) {
    const K = V._lpa || V.firstChild;
    e.shapeFlag & 16 && (P ? (A(t, e), T(V, K), e.targetAnchor || tn(
      V,
      e,
      u,
      h,
      // if target is the same as the main view, insert anchors before current node
      // to avoid hydrating mismatch
      o(t) === V ? t : null
    )) : (e.anchor = l(t), T(V, K), e.targetAnchor || tn(V, e, u, h), g(
      K && l(K),
      e,
      V,
      s,
      n,
      r,
      i
    ))), De(e, P);
  } else P && e.shapeFlag & 16 && (A(t, e), e.targetStart = t, e.targetAnchor = l(t));
  return e.anchor && l(e.anchor);
}
const Bl = kl;
function De(t, e) {
  const s = t.ctx;
  if (s && s.ut) {
    let n, r;
    for (e ? (n = t.el, r = t.anchor) : (n = t.targetStart, r = t.targetAnchor); n && n !== r; )
      n.nodeType === 1 && n.setAttribute("data-v-owner", s.uid), n = n.nextSibling;
    s.ut();
  }
}
function tn(t, e, s, n, r = null) {
  const i = e.targetStart = s(""), l = e.targetAnchor = s("");
  return i[Br] = l, t && (n(i, t, r), n(l, t, r)), l;
}
const $s = /* @__PURE__ */ Symbol("_leaveCb");
function Wl(t) {
  let e = t[0];
  if (t.length > 1) {
    for (const s of t)
      if (s.type !== zt) {
        e = s;
        break;
      }
  }
  return e;
}
function Wr(t) {
  if (!En(t))
    return ws(t.type) && t.children ? Wl(t.children) : t;
  if (t.component)
    return t.component.subTree;
  const { shapeFlag: e, children: s } = t;
  if (s) {
    if (e & 16)
      return s[0];
    if (e & 32 && $(s.default))
      return s.default();
  }
}
function vn(t, e) {
  if (t.shapeFlag & 6 && t.component) {
    t.transition = e;
    const s = t.component.subTree;
    vn(
      ws(s.type) && Wr(s) || s,
      e
    );
  } else t.shapeFlag & 128 ? (t.ssContent.transition = e.clone(t.ssContent), t.ssFallback.transition = e.clone(t.ssFallback)) : t.transition = e;
}
// @__NO_SIDE_EFFECTS__
function Yl(t, e) {
  return $(t) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    pt({ name: t.name }, e, { setup: t })
  ) : t;
}
function Yr(t) {
  t.ids = [t.ids[0] + t.ids[2]++ + "-", 0, 0];
}
function kn(t, e) {
  let s;
  return !!((s = Object.getOwnPropertyDescriptor(t, e)) && !s.configurable);
}
const hs = /* @__PURE__ */ new WeakMap();
function be(t, e, s, n, r = !1) {
  if (j(t)) {
    t.forEach(
      (P, K) => be(
        P,
        e && (j(e) ? e[K] : e),
        s,
        n,
        r
      )
    );
    return;
  }
  if (ye(n) && !r) {
    n.shapeFlag & 512 && n.type.__asyncResolved && n.component.subTree.component && be(t, e, s, n.component.subTree);
    return;
  }
  const i = n.shapeFlag & 4 ? Cn(n.component) : n.el, l = r ? null : i, { i: o, r: f } = t, h = e && e.r, u = o.refs === et ? o.refs = {} : o.refs, g = o.setupState, T = /* @__PURE__ */ z(g), A = g === et ? pr : (P) => kn(u, P) ? !1 : J(T, P), V = (P, K) => !(K && kn(u, K));
  if (h != null && h !== f) {
    if (Kn(e), st(h))
      u[h] = null, A(h) && (g[h] = null);
    else if (/* @__PURE__ */ dt(h)) {
      const P = e;
      V(h, P.k) && (h.value = null), P.k && (u[P.k] = null);
    }
  }
  if ($(f))
    Oe(f, o, 12, [l, u]);
  else {
    const P = st(f), K = /* @__PURE__ */ dt(f);
    if (P || K) {
      const W = () => {
        if (t.f) {
          const I = P ? A(f) ? g[f] : u[f] : V() || !t.k ? f.value : u[t.k];
          if (r)
            j(I) && cn(I, i);
          else if (j(I))
            I.includes(i) || I.push(i);
          else if (P)
            u[f] = [i], A(f) && (g[f] = u[f]);
          else {
            const d = [i];
            V(f, t.k) && (f.value = d), t.k && (u[t.k] = d);
          }
        } else P ? (u[f] = l, A(f) && (g[f] = l)) : K && (V(f, t.k) && (f.value = l), t.k && (u[t.k] = l));
      };
      if (l) {
        const I = () => {
          W(), hs.delete(t);
        };
        I.id = -1, hs.set(t, I), mt(I, s);
      } else
        Kn(t), W();
    }
  }
}
function Kn(t) {
  const e = hs.get(t);
  e && (e.flags |= 8, hs.delete(t));
}
let Bn = !1;
const ie = () => {
  Bn || (console.error("Hydration completed but contains mismatches."), Bn = !0);
}, ql = (t) => t.namespaceURI.includes("svg") && t.tagName !== "foreignObject", Gl = (t) => t.namespaceURI.includes("MathML"), rs = (t) => {
  if (t.nodeType === 1) {
    if (ql(t)) return "svg";
    if (Gl(t)) return "mathml";
  }
}, Me = (t) => t.nodeType === 8;
function zl(t) {
  const {
    mt: e,
    p: s,
    o: {
      patchProp: n,
      createText: r,
      nextSibling: i,
      parentNode: l,
      remove: o,
      insert: f,
      createComment: h
    }
  } = t, u = (d, _) => {
    if (!_.hasChildNodes()) {
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
        "Attempting to hydrate existing markup but container is empty. Performing full mount instead."
      ), s(null, d, _), as(), _._vnode = d;
      return;
    }
    g(_.firstChild, d, null, null, null), as(), _._vnode = d;
  }, g = (d, _, w, B, C, F = !1) => {
    F = F || !!_.dynamicChildren;
    const L = Me(d) && d.data === "[", Y = () => P(
      d,
      _,
      w,
      B,
      C,
      L
    ), { type: N, ref: ot, shapeFlag: lt, patchFlag: rt } = _;
    let ut = d.nodeType;
    _.el = d, __VUE_PROD_DEVTOOLS__ && (Ee(d, "__vnode", _, !0), Ee(d, "__vueParentComponent", w, !0)), rt === -2 && (F = !1, _.dynamicChildren = null);
    let D = null;
    switch (N) {
      case ee:
        ut !== 3 ? _.children === "" ? (f(_.el = r(""), l(d), d), D = d) : D = Y() : (d.data !== _.children && (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
          "Hydration text mismatch in",
          d.parentNode,
          `
  - rendered on server: ${JSON.stringify(
            d.data
          )}
  - expected on client: ${JSON.stringify(_.children)}`
        ), ie(), d.data = _.children), D = i(d));
        break;
      case zt:
        I(d) ? (D = i(d), W(
          _.el = d.content.firstChild,
          d,
          w
        )) : ut !== 8 || L ? D = Y() : D = i(d);
        break;
      case ve:
        if (L && (d = i(d), ut = d.nodeType), ut === 1 || ut === 3) {
          D = d;
          const G = !_.children.length;
          for (let k = 0; k < _.staticCount; k++)
            G && (_.children += D.nodeType === 1 ? D.outerHTML : D.data), k === _.staticCount - 1 && (_.anchor = D), D = i(D);
          return L ? i(D) : D;
        } else
          Y();
        break;
      case At:
        L ? D = V(
          d,
          _,
          w,
          B,
          C,
          F
        ) : D = Y();
        break;
      default:
        if (lt & 1)
          (ut !== 1 || _.type.toLowerCase() !== d.tagName.toLowerCase()) && !I(d) ? D = Y() : D = T(
            d,
            _,
            w,
            B,
            C,
            F
          );
        else if (lt & 6) {
          _.slotScopeIds = C;
          const G = l(d);
          if (L ? D = K(d) : Me(d) && d.data === "teleport start" ? D = K(d, d.data, "teleport end") : D = i(d), e(
            _,
            G,
            null,
            w,
            B,
            rs(G),
            F
          ), ye(_) && !_.component.subTree) {
            let k;
            L ? (k = Et(ve), k.anchor = D ? D.previousSibling : G.lastChild) : k = d.nodeType === 3 ? bi("") : Et("div"), k.el = d, _.component.subTree = k;
          }
        } else lt & 64 ? ut !== 8 ? D = Y() : D = _.type.hydrate(
          d,
          _,
          w,
          B,
          C,
          F,
          t,
          A
        ) : lt & 128 ? D = _.type.hydrate(
          d,
          _,
          w,
          B,
          rs(l(d)),
          C,
          F,
          t,
          g
        ) : __VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt("Invalid HostVNode type:", N, `(${typeof N})`);
    }
    return ot != null && be(ot, null, B, _), D;
  }, T = (d, _, w, B, C, F) => {
    F = F || !!_.dynamicChildren;
    const {
      type: L,
      dynamicProps: Y,
      props: N,
      patchFlag: ot,
      shapeFlag: lt,
      dirs: rt,
      transition: ut
    } = _, D = L === "input" || L === "option", G = !!Y;
    if (D || G || ot !== -1) {
      rt && Vt(_, null, w, "created");
      let k = !1;
      if (I(d)) {
        k = hi(
          null,
          // no need check parentSuspense in hydration
          ut
        ) && w && w.vnode.props && w.vnode.props.appear;
        const Z = d.content.firstChild;
        if (k) {
          const at = Z.getAttribute("class");
          at && (Z.$cls = at), ut.beforeEnter(Z);
        }
        W(Z, d, w), _.el = d = Z;
      }
      if (lt & 16 && // skip if element has innerHTML / textContent
      !(N && (N.innerHTML || N.textContent))) {
        let Z = A(
          d.firstChild,
          _,
          d,
          w,
          B,
          C,
          F
        );
        for (Z && !$e(
          d,
          1
          /* CHILDREN */
        ) && (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
          "Hydration children mismatch on",
          d,
          `
Server rendered element contains more child nodes than client vdom.`
        ), ie()); Z; ) {
          const at = Z;
          Z = Z.nextSibling, o(at);
        }
      } else if (lt & 8) {
        let Z = _.children;
        Z[0] === `
` && (d.tagName === "PRE" || d.tagName === "TEXTAREA") && (Z = Z.slice(1));
        const { textContent: at } = d;
        at !== Z && // innerHTML normalize \r\n or \r into a single \n in the DOM
        at !== Z.replace(/\r\n|\r/g, `
`) && ($e(
          d,
          0
          /* TEXT */
        ) || (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
          "Hydration text content mismatch on",
          d,
          `
  - rendered on server: ${at}
  - expected on client: ${Z}`
        ), ie()), d.textContent = _.children);
      }
      if (N) {
        if (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ || D || G || !F || ot & 48) {
          const Z = d.tagName.includes("-"), at = d.namespaceURI.includes("svg") ? "svg" : d.namespaceURI.includes("MathML") ? "mathml" : void 0;
          for (const it in N)
            if (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && // #11189 skip if this node has directives that have created hooks
            // as it could have mutated the DOM in any possible way
            !(rt && rt.some((Ze) => Ze.dir.created)) && Zl(d, it, N[it], _, w) && ie(), D && (it.endsWith("value") || it === "indeterminate") || ze(it) && !ae(it) || // force hydrate v-bind with .prop modifiers
            it[0] === "." || Z && !ae(it) || Y && Y.includes(it)) {
              if (Xl(d, it, N[it]))
                continue;
              n(d, it, null, N[it], at, w);
            }
        } else if (N.onClick)
          n(
            d,
            "onClick",
            null,
            N.onClick,
            void 0,
            w
          );
        else if (ot & 4 && /* @__PURE__ */ de(N.style))
          for (const Z in N.style) N.style[Z];
      }
      let xt;
      (xt = N && N.onVnodeBeforeMount) && St(xt, w, _), rt && Vt(_, null, w, "beforeMount"), ((xt = N && N.onVnodeMounted) || rt || k) && _i(() => {
        xt && St(xt, w, _), k && ut.enter(d), rt && Vt(_, null, w, "mounted");
      }, B);
    }
    return d.nextSibling;
  }, A = (d, _, w, B, C, F, L) => {
    L = L || !!_.dynamicChildren;
    const Y = _.children, N = Y.length;
    let ot = !1;
    for (let lt = 0; lt < N; lt++) {
      const rt = L ? Y[lt] : Y[lt] = Ot(Y[lt]), ut = rt.type === ee;
      d ? (ut && !L && lt + 1 < N && Ot(Y[lt + 1]).type === ee && (f(
        r(
          d.data.slice(rt.children.length)
        ),
        w,
        i(d)
      ), d.data = rt.children), d = g(
        d,
        rt,
        B,
        C,
        F,
        L
      )) : ut && !rt.children ? f(rt.el = r(""), w) : (ot || (ot = !0, $e(
        w,
        1
        /* CHILDREN */
      ) || (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
        "Hydration children mismatch on",
        w,
        `
Server rendered element contains fewer child nodes than client vdom.`
      ), ie())), s(
        null,
        rt,
        w,
        null,
        B,
        C,
        rs(w),
        F
      ));
    }
    return d;
  }, V = (d, _, w, B, C, F) => {
    const { slotScopeIds: L } = _;
    L && (C = C ? C.concat(L) : L);
    const Y = l(d), N = A(
      i(d),
      _,
      Y,
      w,
      B,
      C,
      F
    );
    return N && Me(N) && N.data === "]" ? i(_.anchor = N) : (ie(), f(_.anchor = h("]"), Y, N), N);
  }, P = (d, _, w, B, C, F) => {
    if (eo(d, _) || (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
      `Hydration node mismatch:
- rendered on server:`,
      d,
      d.nodeType === 3 ? "(text)" : Me(d) && d.data === "[" ? "(start of fragment)" : "",
      `
- expected on client:`,
      _.type
    ), ie()), _.el = null, F) {
      const N = K(d);
      for (; ; ) {
        const ot = i(d);
        if (ot && ot !== N)
          o(ot);
        else
          break;
      }
    }
    const L = i(d), Y = l(d);
    return o(d), s(
      null,
      _,
      Y,
      L,
      w,
      B,
      rs(Y),
      C
    ), w && (w.vnode.el = _.el, si(w, _.el)), L;
  }, K = (d, _ = "[", w = "]") => {
    let B = 0;
    for (; d; )
      if (d = i(d), d && Me(d) && (d.data === _ && B++, d.data === w)) {
        if (B === 0)
          return i(d);
        B--;
      }
    return d;
  }, W = (d, _, w) => {
    const B = _.parentNode;
    B && B.replaceChild(d, _);
    let C = w;
    for (; C; )
      C.vnode.el === _ && (C.vnode.el = C.subTree.el = d), C = C.parent;
  }, I = (d) => d.nodeType === 1 && d.tagName === "TEMPLATE";
  return [u, g];
}
const Jl = /* @__PURE__ */ new Set(["src", "srcset", "href", "poster"]);
function Xl(t, e, s) {
  return Jl.has(e) ? t.getAttribute(e) === (s == null ? null : `${s}`) : !1;
}
function Zl(t, e, s, n, r) {
  let i, l, o, f;
  if (e === "class")
    t.$cls ? (o = t.$cls, delete t.$cls) : o = t.getAttribute("class"), f = Ts(s), Ql(Yn(o || ""), Yn(f)) || (i = 2, l = "class");
  else if (e === "style") {
    o = t.getAttribute("style") || "", f = st(s) ? s : Fi(vs(s));
    const h = qn(o), u = qn(f);
    if (n.dirs)
      for (const { dir: g, value: T } of n.dirs)
        g.name === "show" && !T && u.set("display", "none");
    r && qr(r, n, u), to(h, u) || (i = 3, l = "style");
  } else (t instanceof SVGElement && ki(e) || t instanceof HTMLElement && (Vn(e) || ji(e))) && (e === "hidden" ? (o = Wn(t.getAttribute(e)), f = Wn(s)) : Vn(e) ? (o = t.hasAttribute(e), f = Es(s)) : s == null ? (o = t.hasAttribute(e), f = !1) : (t.hasAttribute(e) ? o = t.getAttribute(e) : e === "value" && t.tagName === "TEXTAREA" ? o = t.value : o = !1, f = br(s) ? String(s) : !1), o !== f && (i = 4, l = e));
  if (i != null && !$e(t, i)) {
    const h = (T) => T === !1 ? "(not rendered)" : `${l}="${T}"`, u = `Hydration ${Gr[i]} mismatch on`, g = `
  - rendered on server: ${h(o)}
  - expected on client: ${h(f)}
  Note: this mismatch is check-only. The DOM will not be rectified in production due to performance overhead.
  You should fix the source of the mismatch.`;
    return Xt(u, t, g), !0;
  }
  return !1;
}
function Wn(t) {
  return br(t) ? st(t) ? t.toLowerCase() === "until-found" ? "until-found" : "" : Es(t) ? "" : !1 : !1;
}
function Yn(t) {
  return new Set(t.trim().split(/\s+/));
}
function Ql(t, e) {
  if (t.size !== e.size)
    return !1;
  for (const s of t)
    if (!e.has(s))
      return !1;
  return !0;
}
function qn(t) {
  const e = /* @__PURE__ */ new Map();
  for (const s of t.split(";")) {
    let [n, r] = s.split(":");
    n = n.trim(), r = r && r.trim(), n && r && e.set(n, r);
  }
  return e;
}
function to(t, e) {
  if (t.size !== e.size)
    return !1;
  for (const [s, n] of t)
    if (n !== e.get(s))
      return !1;
  return !0;
}
function qr(t, e, s) {
  const n = t.subTree;
  if (t.getCssVars && (e === n || n && n.type === At && n.children.includes(e))) {
    const r = t.getCssVars();
    for (const i in r) {
      const l = Yi(r[i]);
      s.set(`--${Bi(i)}`, l);
    }
  }
  e === n && t.parent && qr(t.parent, t.vnode, s);
}
const ds = "data-allow-mismatch", Gr = {
  0: "text",
  1: "children",
  2: "class",
  3: "style",
  4: "attribute"
};
function $e(t, e) {
  if (e === 0 || e === 1)
    for (; t && !t.hasAttribute(ds); )
      t = t.parentElement;
  return Tn(
    t && t.getAttribute(ds),
    e
  );
}
function Tn(t, e) {
  if (t == null)
    return !1;
  if (t === "")
    return !0;
  {
    const s = t.split(",");
    return e === 0 && s.includes("children") ? !0 : s.includes(Gr[e]);
  }
}
function eo(t, e) {
  return $e(
    t.parentElement,
    1
    /* CHILDREN */
  ) || so(t) || no(e);
}
function so(t) {
  return t.nodeType === 1 && Tn(
    t.getAttribute(ds),
    1
    /* CHILDREN */
  );
}
function no({ props: t }) {
  const e = t && t[ds];
  return typeof e == "string" && Tn(
    e,
    1
    /* CHILDREN */
  );
}
ue().requestIdleCallback;
ue().cancelIdleCallback;
const ye = (t) => !!t.type.__asyncLoader, En = (t) => t.type.__isKeepAlive;
function ro(t, e) {
  zr(t, "a", e);
}
function io(t, e) {
  zr(t, "da", e);
}
function zr(t, e, s = yt) {
  const n = t.__wdc || (t.__wdc = () => {
    let r = s;
    for (; r; ) {
      if (r.isDeactivated)
        return;
      r = r.parent;
    }
    return t();
  });
  if (Cs(e, n, s), s) {
    let r = s.parent;
    for (; r && r.parent; )
      En(r.parent.vnode) && lo(n, e, s, r), r = r.parent;
  }
}
function lo(t, e, s, n) {
  const r = Cs(
    e,
    t,
    n,
    !0
    /* prepend */
  );
  Jr(() => {
    cn(n[e], r);
  }, s);
}
function Cs(t, e, s = yt, n = !1) {
  if (s) {
    const r = s[t] || (s[t] = []), i = e.__weh || (e.__weh = (...l) => {
      $t();
      const o = Xe(s), f = Rt(e, s, t, l);
      return o(), jt(), f;
    });
    return n ? r.unshift(i) : r.push(i), i;
  }
}
const Jt = (t) => (e, s = yt) => {
  (!Ge || t === "sp") && Cs(t, (...n) => e(...n), s);
}, oo = Jt("bm"), co = Jt("m"), fo = Jt(
  "bu"
), ao = Jt("u"), uo = Jt(
  "bum"
), Jr = Jt("um"), ho = Jt(
  "sp"
), po = Jt("rtg"), go = Jt("rtc");
function _o(t, e = yt) {
  Cs("ec", t, e);
}
const mo = /* @__PURE__ */ Symbol.for("v-ndc"), en = (t) => t ? yi(t) ? Cn(t) : en(t.parent) : null, je = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ pt(/* @__PURE__ */ Object.create(null), {
    $: (t) => t,
    $el: (t) => t.vnode.el,
    $data: (t) => t.data,
    $props: (t) => t.props,
    $attrs: (t) => t.attrs,
    $slots: (t) => t.slots,
    $refs: (t) => t.refs,
    $parent: (t) => en(t.parent),
    $root: (t) => en(t.root),
    $host: (t) => t.ce,
    $emit: (t) => t.emit,
    $options: (t) => __VUE_OPTIONS_API__ ? Zr(t) : t.type,
    $forceUpdate: (t) => t.f || (t.f = () => {
      yn(t.update);
    }),
    $nextTick: (t) => t.n || (t.n = wl.bind(t.proxy)),
    $watch: (t) => __VUE_OPTIONS_API__ ? $l.bind(t) : Ct
  })
), js = (t, e) => t !== et && !t.__isScriptSetup && J(t, e), bo = {
  get({ _: t }, e) {
    if (e === "__v_skip")
      return !0;
    const { ctx: s, setupState: n, data: r, props: i, accessCache: l, type: o, appContext: f } = t;
    if (e[0] !== "$") {
      const T = l[e];
      if (T !== void 0)
        switch (T) {
          case 1:
            return n[e];
          case 2:
            return r[e];
          case 4:
            return s[e];
          case 3:
            return i[e];
        }
      else {
        if (js(n, e))
          return l[e] = 1, n[e];
        if (__VUE_OPTIONS_API__ && r !== et && J(r, e))
          return l[e] = 2, r[e];
        if (J(i, e))
          return l[e] = 3, i[e];
        if (s !== et && J(s, e))
          return l[e] = 4, s[e];
        (!__VUE_OPTIONS_API__ || sn) && (l[e] = 0);
      }
    }
    const h = je[e];
    let u, g;
    if (h)
      return e === "$attrs" && gt(t.attrs, "get", ""), h(t);
    if (
      // css module (injected by vue-loader)
      (u = o.__cssModules) && (u = u[e])
    )
      return u;
    if (s !== et && J(s, e))
      return l[e] = 4, s[e];
    if (
      // global properties
      g = f.config.globalProperties, J(g, e)
    )
      return g[e];
  },
  set({ _: t }, e, s) {
    const { data: n, setupState: r, ctx: i } = t;
    return js(r, e) ? (r[e] = s, !0) : __VUE_OPTIONS_API__ && n !== et && J(n, e) ? (n[e] = s, !0) : J(t.props, e) || e[0] === "$" && e.slice(1) in t ? !1 : (i[e] = s, !0);
  },
  has({
    _: { data: t, setupState: e, accessCache: s, ctx: n, appContext: r, props: i, type: l }
  }, o) {
    let f;
    return !!(s[o] || __VUE_OPTIONS_API__ && t !== et && o[0] !== "$" && J(t, o) || js(e, o) || J(i, o) || J(n, o) || J(je, o) || J(r.config.globalProperties, o) || (f = l.__cssModules) && f[o]);
  },
  defineProperty(t, e, s) {
    return s.get != null ? t._.accessCache[e] = 0 : J(s, "value") && this.set(t, e, s.value, null), Reflect.defineProperty(t, e, s);
  }
};
function Gn(t) {
  return j(t) ? t.reduce(
    (e, s) => (e[s] = null, e),
    {}
  ) : t;
}
let sn = !0;
function yo(t) {
  const e = Zr(t), s = t.proxy, n = t.ctx;
  sn = !1, e.beforeCreate && zn(e.beforeCreate, t, "bc");
  const {
    // state
    data: r,
    computed: i,
    methods: l,
    watch: o,
    provide: f,
    inject: h,
    // lifecycle
    created: u,
    beforeMount: g,
    mounted: T,
    beforeUpdate: A,
    updated: V,
    activated: P,
    deactivated: K,
    beforeDestroy: W,
    beforeUnmount: I,
    destroyed: d,
    unmounted: _,
    render: w,
    renderTracked: B,
    renderTriggered: C,
    errorCaptured: F,
    serverPrefetch: L,
    // public API
    expose: Y,
    inheritAttrs: N,
    // assets
    components: ot,
    directives: lt,
    filters: rt
  } = e;
  if (h && xo(h, n, null), l)
    for (const G in l) {
      const k = l[G];
      $(k) && (n[G] = k.bind(s));
    }
  if (r) {
    const G = r.call(s, s);
    nt(G) && (t.data = /* @__PURE__ */ _n(G));
  }
  if (sn = !0, i)
    for (const G in i) {
      const k = i[G], xt = $(k) ? k.bind(s, s) : $(k.get) ? k.get.bind(s, s) : Ct, Z = !$(k) && $(k.set) ? k.set.bind(s) : Ct, at = ic({
        get: xt,
        set: Z
      });
      Object.defineProperty(n, G, {
        enumerable: !0,
        configurable: !0,
        get: () => at.value,
        set: (it) => at.value = it
      });
    }
  if (o)
    for (const G in o)
      Xr(o[G], n, s, G);
  if (f) {
    const G = $(f) ? f.call(s) : f;
    Reflect.ownKeys(G).forEach((k) => {
      Nl(k, G[k]);
    });
  }
  u && zn(u, t, "c");
  function D(G, k) {
    j(k) ? k.forEach((xt) => G(xt.bind(s))) : k && G(k.bind(s));
  }
  if (D(oo, g), D(co, T), D(fo, A), D(ao, V), D(ro, P), D(io, K), D(_o, F), D(go, B), D(po, C), D(uo, I), D(Jr, _), D(ho, L), j(Y))
    if (Y.length) {
      const G = t.exposed || (t.exposed = {});
      Y.forEach((k) => {
        Object.defineProperty(G, k, {
          get: () => s[k],
          set: (xt) => s[k] = xt,
          enumerable: !0
        });
      });
    } else t.exposed || (t.exposed = {});
  w && t.render === Ct && (t.render = w), N != null && (t.inheritAttrs = N), ot && (t.components = ot), lt && (t.directives = lt), L && Yr(t);
}
function xo(t, e, s = Ct) {
  j(t) && (t = nn(t));
  for (const n in t) {
    const r = t[n];
    let i;
    nt(r) ? "default" in r ? i = ls(
      r.from || n,
      r.default,
      !0
    ) : i = ls(r.from || n) : i = ls(r), /* @__PURE__ */ dt(i) ? Object.defineProperty(e, n, {
      enumerable: !0,
      configurable: !0,
      get: () => i.value,
      set: (l) => i.value = l
    }) : e[n] = i;
  }
}
function zn(t, e, s) {
  Rt(
    j(t) ? t.map((n) => n.bind(e.proxy)) : t.bind(e.proxy),
    e,
    s
  );
}
function Xr(t, e, s, n) {
  let r = n.includes(".") ? Kr(s, n) : () => s[n];
  if (st(t)) {
    const i = e[t];
    $(i) && Fs(r, i);
  } else if ($(t))
    Fs(r, t.bind(s));
  else if (nt(t))
    if (j(t))
      t.forEach((i) => Xr(i, e, s, n));
    else {
      const i = $(t.handler) ? t.handler.bind(s) : e[t.handler];
      $(i) && Fs(r, i, t);
    }
}
function Zr(t) {
  const e = t.type, { mixins: s, extends: n } = e, {
    mixins: r,
    optionsCache: i,
    config: { optionMergeStrategies: l }
  } = t.appContext, o = i.get(e);
  let f;
  return o ? f = o : !r.length && !s && !n ? f = e : (f = {}, r.length && r.forEach(
    (h) => ps(f, h, l, !0)
  ), ps(f, e, l)), nt(e) && i.set(e, f), f;
}
function ps(t, e, s, n = !1) {
  const { mixins: r, extends: i } = e;
  i && ps(t, i, s, !0), r && r.forEach(
    (l) => ps(t, l, s, !0)
  );
  for (const l in e)
    if (!(n && l === "expose")) {
      const o = vo[l] || s && s[l];
      t[l] = o ? o(t[l], e[l]) : e[l];
    }
  return t;
}
const vo = {
  data: Jn,
  props: Xn,
  emits: Xn,
  // objects
  methods: He,
  computed: He,
  // lifecycle
  beforeCreate: _t,
  created: _t,
  beforeMount: _t,
  mounted: _t,
  beforeUpdate: _t,
  updated: _t,
  beforeDestroy: _t,
  beforeUnmount: _t,
  destroyed: _t,
  unmounted: _t,
  activated: _t,
  deactivated: _t,
  errorCaptured: _t,
  serverPrefetch: _t,
  // assets
  components: He,
  directives: He,
  // watch
  watch: Eo,
  // provide / inject
  provide: Jn,
  inject: To
};
function Jn(t, e) {
  return e ? t ? function() {
    return pt(
      $(t) ? t.call(this, this) : t,
      $(e) ? e.call(this, this) : e
    );
  } : e : t;
}
function To(t, e) {
  return He(nn(t), nn(e));
}
function nn(t) {
  if (j(t)) {
    const e = {};
    for (let s = 0; s < t.length; s++)
      e[t[s]] = t[s];
    return e;
  }
  return t;
}
function _t(t, e) {
  return t ? [...new Set([].concat(t, e))] : e;
}
function He(t, e) {
  return t ? pt(/* @__PURE__ */ Object.create(null), t, e) : e;
}
function Xn(t, e) {
  return t ? j(t) && j(e) ? [.../* @__PURE__ */ new Set([...t, ...e])] : pt(
    /* @__PURE__ */ Object.create(null),
    Gn(t),
    Gn(e ?? {})
  ) : e;
}
function Eo(t, e) {
  if (!t) return e;
  if (!e) return t;
  const s = pt(/* @__PURE__ */ Object.create(null), t);
  for (const n in e)
    s[n] = _t(t[n], e[n]);
  return s;
}
function Qr() {
  return {
    app: null,
    config: {
      isNativeTag: pr,
      performance: !1,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let So = 0;
function Ao(t, e) {
  return function(n, r = null) {
    $(n) || (n = pt({}, n)), r != null && !nt(r) && (r = null);
    const i = Qr(), l = /* @__PURE__ */ new WeakSet(), o = [];
    let f = !1;
    const h = i.app = {
      _uid: So++,
      _component: n,
      _props: r,
      _container: null,
      _context: i,
      _instance: null,
      version: nr,
      get config() {
        return i.config;
      },
      set config(u) {
      },
      use(u, ...g) {
        return l.has(u) || (u && $(u.install) ? (l.add(u), u.install(h, ...g)) : $(u) && (l.add(u), u(h, ...g))), h;
      },
      mixin(u) {
        return __VUE_OPTIONS_API__ && (i.mixins.includes(u) || i.mixins.push(u)), h;
      },
      component(u, g) {
        return g ? (i.components[u] = g, h) : i.components[u];
      },
      directive(u, g) {
        return g ? (i.directives[u] = g, h) : i.directives[u];
      },
      mount(u, g, T) {
        if (!f) {
          const A = h._ceVNode || Et(n, r);
          return A.appContext = i, T === !0 ? T = "svg" : T === !1 && (T = void 0), g && e ? e(A, u) : t(A, u, T), f = !0, h._container = u, u.__vue_app__ = h, __VUE_PROD_DEVTOOLS__ && (h._instance = A.component, Ml(h, nr)), Cn(A.component);
        }
      },
      onUnmount(u) {
        o.push(u);
      },
      unmount() {
        f && (Rt(
          o,
          h._instance,
          16
        ), t(null, h._container), __VUE_PROD_DEVTOOLS__ && (h._instance = null, Il(h)), delete h._container.__vue_app__);
      },
      provide(u, g) {
        return i.provides[u] = g, h;
      },
      runWithContext(u) {
        const g = xe;
        xe = h;
        try {
          return u();
        } finally {
          xe = g;
        }
      }
    };
    return h;
  };
}
let xe = null;
const Oo = (t, e) => e === "modelValue" || e === "model-value" ? t.modelModifiers : t[`${e}Modifiers`] || t[`${Pt(e)}Modifiers`] || t[`${re(e)}Modifiers`];
function wo(t, e, ...s) {
  if (t.isUnmounted) return;
  const n = t.vnode.props || et;
  let r = s;
  const i = e.startsWith("update:"), l = i && Oo(n, e.slice(7));
  l && (l.trim && (r = s.map((u) => st(u) ? u.trim() : u)), l.number && (r = r.map(Hi))), __VUE_PROD_DEVTOOLS__ && Vl(t, e, r);
  let o, f = n[o = Ds(e)] || // also try camelCase event handler (#2249)
  n[o = Ds(Pt(e))];
  !f && i && (f = n[o = Ds(re(e))]), f && Rt(
    f,
    t,
    6,
    r
  );
  const h = n[o + "Once"];
  if (h) {
    if (!t.emitted)
      t.emitted = {};
    else if (t.emitted[o])
      return;
    t.emitted[o] = !0, Rt(
      h,
      t,
      6,
      r
    );
  }
}
const Co = /* @__PURE__ */ new WeakMap();
function ti(t, e, s = !1) {
  const n = __VUE_OPTIONS_API__ && s ? Co : e.emitsCache, r = n.get(t);
  if (r !== void 0)
    return r;
  const i = t.emits;
  let l = {}, o = !1;
  if (__VUE_OPTIONS_API__ && !$(t)) {
    const f = (h) => {
      const u = ti(h, e, !0);
      u && (o = !0, pt(l, u));
    };
    !s && e.mixins.length && e.mixins.forEach(f), t.extends && f(t.extends), t.mixins && t.mixins.forEach(f);
  }
  return !i && !o ? (nt(t) && n.set(t, null), null) : (j(i) ? i.forEach((f) => l[f] = null) : pt(l, i), nt(t) && n.set(t, l), l);
}
function Ps(t, e) {
  return !t || !ze(e) ? !1 : (e = e.slice(2), e = e === "Once" ? e : e.replace(/Once$/, ""), J(t, e[0].toLowerCase() + e.slice(1)) || J(t, re(e)) || J(t, e));
}
function ks(t) {
  const {
    type: e,
    vnode: s,
    proxy: n,
    withProxy: r,
    propsOptions: [i],
    slots: l,
    attrs: o,
    emit: f,
    render: h,
    renderCache: u,
    props: g,
    data: T,
    setupState: A,
    ctx: V,
    inheritAttrs: P
  } = t, K = us(t);
  let W, I;
  try {
    if (s.shapeFlag & 4) {
      const _ = r || n, w = _;
      W = Ot(
        h.call(
          w,
          _,
          u,
          g,
          A,
          T,
          V
        )
      ), I = o;
    } else {
      const _ = e;
      W = Ot(
        _.length > 1 ? _(
          g,
          { attrs: o, slots: l, emit: f }
        ) : _(
          g,
          null
        )
      ), I = e.props ? o : Po(o);
    }
  } catch (_) {
    Te.length = 0, As(_, t, 1), W = Et(zt);
  }
  let d = W;
  if (I && P !== !1) {
    const _ = Object.keys(I), { shapeFlag: w } = d;
    _.length && w & 7 && (i && _.some(ys) && (I = Mo(
      I,
      i
    )), d = Se(d, I, !1, !0));
  }
  if (s.dirs && (d = Se(d, null, !1, !0), d.dirs = d.dirs ? d.dirs.concat(s.dirs) : s.dirs), s.transition) {
    const _ = ws(d.type) && Wr(d) || d;
    vn(_, s.transition);
  }
  return W = d, us(K), W;
}
const Po = (t) => {
  let e;
  for (const s in t)
    (s === "class" || s === "style" || ze(s)) && ((e || (e = {}))[s] = t[s]);
  return e;
}, Mo = (t, e) => {
  const s = {};
  for (const n in t)
    (!ys(n) || !(n.slice(9) in e)) && (s[n] = t[n]);
  return s;
};
function Io(t, e, s) {
  const { props: n, children: r, component: i } = t, { props: l, children: o, patchFlag: f } = e, h = i.emitsOptions;
  if (e.dirs || e.transition)
    return !0;
  if (s && f >= 0) {
    if (f & 1024)
      return !0;
    if (f & 16)
      return n ? Zn(n, l, h) : !!l;
    if (f & 8) {
      const u = e.dynamicProps;
      for (let g = 0; g < u.length; g++) {
        const T = u[g];
        if (ei(l, n, T) && !Ps(h, T))
          return !0;
      }
    }
  } else
    return (r || o) && (!o || !o.$stable) ? !0 : n === l ? !1 : n ? l ? Zn(n, l, h) : !0 : !!l;
  return !1;
}
function Zn(t, e, s) {
  const n = Object.keys(e);
  if (n.length !== Object.keys(t).length)
    return !0;
  for (let r = 0; r < n.length; r++) {
    const i = n[r];
    if (ei(e, t, i) && !Ps(s, i))
      return !0;
  }
  return !1;
}
function ei(t, e, s) {
  const n = t[s], r = e[s];
  return s === "style" && nt(n) && nt(r) ? !Ss(n, r) : n !== r;
}
function si({ vnode: t, parent: e, suspense: s }, n) {
  for (; e; ) {
    const r = e.subTree;
    if (r.suspense && r.suspense.activeBranch === t && (r.suspense.vnode.el = r.el = n, t = r), r === t)
      (t = e.vnode).el = n, e = e.parent;
    else
      break;
  }
  s && s.activeBranch === t && (s.vnode.el = n);
}
const ni = {}, ri = () => Object.create(ni), ii = (t) => Object.getPrototypeOf(t) === ni;
function Ro(t, e, s, n = !1) {
  const r = {}, i = ri();
  t.propsDefaults = /* @__PURE__ */ Object.create(null), li(t, e, r, i);
  for (const l in t.propsOptions[0])
    l in r || (r[l] = void 0);
  s ? t.props = n ? r : /* @__PURE__ */ hl(r) : t.type.props ? t.props = r : t.props = i, t.attrs = i;
}
function Do(t, e, s, n) {
  const {
    props: r,
    attrs: i,
    vnode: { patchFlag: l }
  } = t, o = /* @__PURE__ */ z(r), [f] = t.propsOptions;
  let h = !1;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (n || l > 0) && !(l & 16)
  ) {
    if (l & 8) {
      const u = t.vnode.dynamicProps;
      for (let g = 0; g < u.length; g++) {
        let T = u[g];
        if (Ps(t.emitsOptions, T))
          continue;
        const A = e[T];
        if (f)
          if (J(i, T))
            A !== i[T] && (i[T] = A, h = !0);
          else {
            const V = Pt(T);
            r[V] = rn(
              f,
              o,
              V,
              A,
              t,
              !1
            );
          }
        else
          A !== i[T] && (i[T] = A, h = !0);
      }
    }
  } else {
    li(t, e, r, i) && (h = !0);
    let u;
    for (const g in o)
      (!e || // for camelCase
      !J(e, g) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((u = re(g)) === g || !J(e, u))) && (f ? s && // for camelCase
      (s[g] !== void 0 || // for kebab-case
      s[u] !== void 0) && (r[g] = rn(
        f,
        o,
        g,
        void 0,
        t,
        !0
      )) : delete r[g]);
    if (i !== o)
      for (const g in i)
        (!e || !J(e, g)) && (delete i[g], h = !0);
  }
  h && Wt(t.attrs, "set", "");
}
function li(t, e, s, n) {
  const [r, i] = t.propsOptions;
  let l = !1, o;
  if (e)
    for (let f in e) {
      if (ae(f))
        continue;
      const h = e[f];
      let u;
      r && J(r, u = Pt(f)) ? !i || !i.includes(u) ? s[u] = h : (o || (o = {}))[u] = h : Ps(t.emitsOptions, f) || (!(f in n) || h !== n[f]) && (n[f] = h, l = !0);
    }
  if (i) {
    const f = /* @__PURE__ */ z(s), h = o || et;
    for (let u = 0; u < i.length; u++) {
      const g = i[u];
      s[g] = rn(
        r,
        f,
        g,
        h[g],
        t,
        !J(h, g)
      );
    }
  }
  return l;
}
function rn(t, e, s, n, r, i) {
  const l = t[s];
  if (l != null) {
    const o = J(l, "default");
    if (o && n === void 0) {
      const f = l.default;
      if (l.type !== Function && !l.skipFactory && $(f)) {
        const { propsDefaults: h } = r;
        if (s in h)
          n = h[s];
        else {
          const u = Xe(r);
          n = h[s] = f.call(
            null,
            e
          ), u();
        }
      } else
        n = f;
      r.ce && r.ce._setProp(s, n);
    }
    l[
      0
      /* shouldCast */
    ] && (i && !o ? n = !1 : l[
      1
      /* shouldCastTrue */
    ] && (n === "" || n === re(s)) && (n = !0));
  }
  return n;
}
const Ho = /* @__PURE__ */ new WeakMap();
function oi(t, e, s = !1) {
  const n = __VUE_OPTIONS_API__ && s ? Ho : e.propsCache, r = n.get(t);
  if (r)
    return r;
  const i = t.props, l = {}, o = [];
  let f = !1;
  if (__VUE_OPTIONS_API__ && !$(t)) {
    const u = (g) => {
      f = !0;
      const [T, A] = oi(g, e, !0);
      pt(l, T), A && o.push(...A);
    };
    !s && e.mixins.length && e.mixins.forEach(u), t.extends && u(t.extends), t.mixins && t.mixins.forEach(u);
  }
  if (!i && !f)
    return nt(t) && n.set(t, Le), Le;
  if (j(i))
    for (let u = 0; u < i.length; u++) {
      const g = Pt(i[u]);
      Qn(g) && (l[g] = et);
    }
  else if (i)
    for (const u in i) {
      const g = Pt(u);
      if (Qn(g)) {
        const T = i[u], A = l[g] = j(T) || $(T) ? { type: T } : pt({}, T), V = A.type;
        let P = !1, K = !0;
        if (j(V))
          for (let W = 0; W < V.length; ++W) {
            const I = V[W], d = $(I) && I.name;
            if (d === "Boolean") {
              P = !0;
              break;
            } else d === "String" && (K = !1);
          }
        else
          P = $(V) && V.name === "Boolean";
        A[
          0
          /* shouldCast */
        ] = P, A[
          1
          /* shouldCastTrue */
        ] = K, (P || J(A, "default")) && o.push(g);
      }
    }
  const h = [l, o];
  return nt(t) && n.set(t, h), h;
}
function Qn(t) {
  return t[0] !== "$" && !ae(t);
}
const Sn = (t) => t === "_" || t === "_ctx" || t === "$stable", An = (t) => j(t) ? t.map(Ot) : [Ot(t)], Vo = (t, e, s) => {
  if (e._n)
    return e;
  const n = Ll((...r) => An(e(...r)), s);
  return n._c = !1, n;
}, ci = (t, e, s) => {
  const n = t._ctx;
  for (const r in t) {
    if (Sn(r)) continue;
    const i = t[r];
    if ($(i))
      e[r] = Vo(r, i, n);
    else if (i != null) {
      const l = An(i);
      e[r] = () => l;
    }
  }
}, fi = (t, e) => {
  const s = An(e);
  t.slots.default = () => s;
}, ai = (t, e, s) => {
  for (const n in e)
    (s || !Sn(n)) && (t[n] = e[n]);
}, Lo = (t, e, s) => {
  const n = t.slots = ri();
  if (t.vnode.shapeFlag & 32) {
    const r = e._;
    r ? (ai(n, e, s), s && Ee(n, "_", r, !0)) : ci(e, n);
  } else e && fi(t, e);
}, No = (t, e, s) => {
  const { vnode: n, slots: r } = t;
  let i = !0, l = et;
  if (n.shapeFlag & 32) {
    const o = e._;
    o ? s && o === 1 ? i = !1 : ai(r, e, s) : (i = !e.$stable, ci(e, r)), l = e;
  } else e && (fi(t, e), l = { default: 1 });
  if (i)
    for (const o in r)
      !Sn(o) && l[o] == null && delete r[o];
};
function Uo() {
  typeof __VUE_OPTIONS_API__ != "boolean" && (ue().__VUE_OPTIONS_API__ = !0), typeof __VUE_PROD_DEVTOOLS__ != "boolean" && (ue().__VUE_PROD_DEVTOOLS__ = !1), typeof __VUE_PROD_HYDRATION_MISMATCH_DETAILS__ != "boolean" && (ue().__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = !1);
}
const mt = _i;
function Fo(t) {
  return ui(t);
}
function $o(t) {
  return ui(t, zl);
}
function ui(t, e) {
  Uo();
  const s = ue();
  s.__VUE__ = !0, __VUE_PROD_DEVTOOLS__ && Fr(s.__VUE_DEVTOOLS_GLOBAL_HOOK__, s);
  const {
    insert: n,
    remove: r,
    patchProp: i,
    createElement: l,
    createText: o,
    createComment: f,
    setText: h,
    setElementText: u,
    parentNode: g,
    nextSibling: T,
    setScopeId: A = Ct,
    insertStaticContent: V
  } = t, P = (c, a, p, x = null, b = null, m = null, S = void 0, E = null, v = !!a.dynamicChildren) => {
    if (c === a)
      return;
    c && !Ie(c, a) && (x = Qe(c), it(c, b, m, !0), c = null), a.patchFlag === -2 && (v = !1, a.dynamicChildren = null);
    const { type: y, ref: R, shapeFlag: O } = a;
    switch (y) {
      case ee:
        K(c, a, p, x);
        break;
      case zt:
        W(c, a, p, x);
        break;
      case ve:
        c == null && I(a, p, x, S);
        break;
      case At:
        ot(
          c,
          a,
          p,
          x,
          b,
          m,
          S,
          E,
          v
        );
        break;
      default:
        O & 1 ? w(
          c,
          a,
          p,
          x,
          b,
          m,
          S,
          E,
          v
        ) : O & 6 ? lt(
          c,
          a,
          p,
          x,
          b,
          m,
          S,
          E,
          v
        ) : (O & 64 || O & 128) && y.process(
          c,
          a,
          p,
          x,
          b,
          m,
          S,
          E,
          v,
          pe
        );
    }
    R != null && b ? be(R, c && c.ref, m, a || c, !a) : R == null && c && c.ref != null && be(c.ref, null, m, c, !0);
  }, K = (c, a, p, x) => {
    if (c == null)
      n(
        a.el = o(a.children),
        p,
        x
      );
    else {
      const b = a.el = c.el;
      a.children !== c.children && h(b, a.children);
    }
  }, W = (c, a, p, x) => {
    c == null ? n(
      a.el = f(a.children || ""),
      p,
      x
    ) : a.el = c.el;
  }, I = (c, a, p, x) => {
    [c.el, c.anchor] = V(
      c.children,
      a,
      p,
      x,
      c.el,
      c.anchor
    );
  }, d = ({ el: c, anchor: a }, p, x) => {
    let b;
    for (; c && c !== a; )
      b = T(c), n(c, p, x), c = b;
    n(a, p, x);
  }, _ = ({ el: c, anchor: a }) => {
    let p;
    for (; c && c !== a; )
      p = T(c), r(c), c = p;
    r(a);
  }, w = (c, a, p, x, b, m, S, E, v) => {
    if (a.type === "svg" ? S = "svg" : a.type === "math" && (S = "mathml"), c == null)
      B(
        a,
        p,
        x,
        b,
        m,
        S,
        E,
        v
      );
    else {
      const y = c.el && c.el._isVueCE ? c.el : null;
      try {
        y && y._beginPatch(), L(
          c,
          a,
          b,
          m,
          S,
          E,
          v
        );
      } finally {
        y && y._endPatch();
      }
    }
  }, B = (c, a, p, x, b, m, S, E) => {
    let v, y;
    const { props: R, shapeFlag: O, transition: M, dirs: H } = c;
    if (v = c.el = l(
      c.type,
      m,
      R && R.is,
      R
    ), O & 8 ? u(v, c.children) : O & 16 && F(
      c.children,
      v,
      null,
      x,
      b,
      Ks(c, m),
      S,
      E
    ), H && Vt(c, null, x, "created"), C(v, c, c.scopeId, S, x), R) {
      for (const Q in R)
        Q !== "value" && !ae(Q) && i(v, Q, null, R[Q], m, x);
      "value" in R && i(v, "value", null, R.value, m), (y = R.onVnodeBeforeMount) && St(y, x, c);
    }
    __VUE_PROD_DEVTOOLS__ && (Ee(v, "__vnode", c, !0), Ee(v, "__vueParentComponent", x, !0)), H && Vt(c, null, x, "beforeMount");
    const q = hi(b, M);
    q && M.beforeEnter(v), n(v, a, p), ((y = R && R.onVnodeMounted) || q || H) && mt(() => {
      try {
        y && St(y, x, c), q && M.enter(v), H && Vt(c, null, x, "mounted");
      } finally {
      }
    }, b);
  }, C = (c, a, p, x, b) => {
    if (p && A(c, p), x)
      for (let m = 0; m < x.length; m++)
        A(c, x[m]);
    if (b) {
      let m = b.subTree;
      if (a === m || gi(m.type) && (m.ssContent === a || m.ssFallback === a)) {
        const S = b.vnode;
        C(
          c,
          S,
          S.scopeId,
          S.slotScopeIds,
          b.parent
        );
      }
    }
  }, F = (c, a, p, x, b, m, S, E, v = 0) => {
    for (let y = v; y < c.length; y++) {
      const R = c[y] = E ? Bt(c[y]) : Ot(c[y]);
      P(
        null,
        R,
        a,
        p,
        x,
        b,
        m,
        S,
        E
      );
    }
  }, L = (c, a, p, x, b, m, S) => {
    const E = a.el = c.el;
    __VUE_PROD_DEVTOOLS__ && (E.__vnode = a);
    let { patchFlag: v, dynamicChildren: y, dirs: R } = a;
    v |= c.patchFlag & 16;
    const O = c.props || et, M = a.props || et;
    let H;
    if (p && le(p, !1), (H = M.onVnodeBeforeUpdate) && St(H, p, a, c), R && Vt(a, c, p, "beforeUpdate"), p && le(p, !0), // #6385 the old vnode may be a user-wrapped non-isomorphic block
    // Force full diff when block metadata is unstable.
    y && (!c.dynamicChildren || c.dynamicChildren.length !== y.length) && (v = 0, S = !1, y = null), (O.innerHTML && M.innerHTML == null || O.textContent && M.textContent == null) && u(E, ""), y ? Y(
      c.dynamicChildren,
      y,
      E,
      p,
      x,
      Ks(a, b),
      m
    ) : S || k(
      c,
      a,
      E,
      null,
      p,
      x,
      Ks(a, b),
      m,
      !1
    ), v > 0) {
      if (v & 16)
        N(E, O, M, p, b);
      else if (v & 2 && O.class !== M.class && i(E, "class", null, M.class, b), v & 4 && i(E, "style", O.style, M.style, b), v & 8) {
        const q = a.dynamicProps;
        for (let Q = 0; Q < q.length; Q++) {
          const X = q[Q], ct = O[X], ft = M[X];
          (ft !== ct || X === "value") && i(E, X, ct, ft, b, p);
        }
      }
      v & 1 && c.children !== a.children && u(E, a.children);
    } else !S && y == null && N(E, O, M, p, b);
    ((H = M.onVnodeUpdated) || R) && mt(() => {
      H && St(H, p, a, c), R && Vt(a, c, p, "updated");
    }, x);
  }, Y = (c, a, p, x, b, m, S) => {
    for (let E = 0; E < a.length; E++) {
      const v = c[E], y = a[E], R = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        v.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (v.type === At || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !Ie(v, y) || // - In the case of a component, it could contain anything.
        v.shapeFlag & 198) ? g(v.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          p
        )
      );
      P(
        v,
        y,
        R,
        null,
        x,
        b,
        m,
        S,
        !0
      );
    }
  }, N = (c, a, p, x, b) => {
    if (a !== p) {
      if (a !== et)
        for (const m in a)
          !ae(m) && !(m in p) && i(
            c,
            m,
            a[m],
            null,
            b,
            x
          );
      for (const m in p) {
        if (ae(m)) continue;
        const S = p[m], E = a[m];
        S !== E && m !== "value" && i(c, m, E, S, b, x);
      }
      "value" in p && i(c, "value", a.value, p.value, b);
    }
  }, ot = (c, a, p, x, b, m, S, E, v) => {
    const y = a.el = c ? c.el : o(""), R = a.anchor = c ? c.anchor : o("");
    let { patchFlag: O, dynamicChildren: M, slotScopeIds: H } = a;
    H && (E = E ? E.concat(H) : H), c == null ? (n(y, p, x), n(R, p, x), F(
      // #10007
      // such fragment like `<></>` will be compiled into
      // a fragment which doesn't have a children.
      // In this case fallback to an empty array
      a.children || [],
      p,
      R,
      b,
      m,
      S,
      E,
      v
    )) : O > 0 && O & 64 && M && // #2715 the previous fragment could've been a BAILed one as a result
    // of renderSlot() with no valid children
    c.dynamicChildren && c.dynamicChildren.length === M.length ? (Y(
      c.dynamicChildren,
      M,
      p,
      b,
      m,
      S,
      E
    ), // #2080 if the stable fragment has a key, it's a <template v-for> that may
    //  get moved around. Make sure all root level vnodes inherit el.
    // #2134 or if it's a component root, it may also get moved around
    // as the component is being moved.
    (a.key != null || b && a === b.subTree) && On(
      c,
      a,
      !0
      /* shallow */
    )) : k(
      c,
      a,
      p,
      R,
      b,
      m,
      S,
      E,
      v
    );
  }, lt = (c, a, p, x, b, m, S, E, v) => {
    a.slotScopeIds = E, c == null ? a.shapeFlag & 512 ? b.ctx.activate(
      a,
      p,
      x,
      S,
      v
    ) : rt(
      a,
      p,
      x,
      b,
      m,
      S,
      v
    ) : ut(c, a, v);
  }, rt = (c, a, p, x, b, m, S) => {
    const E = c.component = zo(
      c,
      x,
      b
    );
    if (En(c) && (E.ctx.renderer = pe), Xo(E, !1, S), E.asyncDep) {
      if (b && b.registerDep(E, D, S), !c.el) {
        const v = E.subTree = Et(zt);
        W(null, v, a, p), c.placeholder = v.el;
      }
    } else
      D(
        E,
        c,
        a,
        p,
        b,
        m,
        S
      );
  }, ut = (c, a, p) => {
    const x = a.component = c.component;
    if (Io(c, a, p))
      if (x.asyncDep && !x.asyncResolved) {
        G(x, a, p);
        return;
      } else
        x.next = a, x.update();
    else
      a.el = c.el, x.vnode = a;
  }, D = (c, a, p, x, b, m, S) => {
    const E = () => {
      if (c.isMounted) {
        let { next: O, bu: M, u: H, parent: q, vnode: Q } = c;
        {
          const vt = di(c);
          if (vt) {
            O && (O.el = Q.el, G(c, O, S)), vt.asyncDep.then(() => {
              mt(() => {
                c.isUnmounted || y();
              }, b);
            });
            return;
          }
        }
        let X = O, ct;
        le(c, !1), O ? (O.el = Q.el, G(c, O, S)) : O = Q, M && Hs(M), (ct = O.props && O.props.onVnodeBeforeUpdate) && St(ct, q, O, Q), le(c, !0);
        const ft = ks(c), wt = c.subTree;
        c.subTree = ft, P(
          wt,
          ft,
          // parent may have changed if it's in a teleport
          g(wt.el),
          // anchor may have changed if it's in a fragment
          Qe(wt),
          c,
          b,
          m
        ), O.el = ft.el, X === null && si(c, ft.el), H && mt(H, b), (ct = O.props && O.props.onVnodeUpdated) && mt(
          () => St(ct, q, O, Q),
          b
        ), __VUE_PROD_DEVTOOLS__ && $r(c);
      } else {
        let O;
        const { el: M, props: H } = a, { bm: q, m: Q, parent: X, root: ct, type: ft } = c, wt = ye(a);
        if (le(c, !1), q && Hs(q), !wt && (O = H && H.onVnodeBeforeMount) && St(O, X, a), le(c, !0), M && Rs) {
          const vt = () => {
            c.subTree = ks(c), Rs(
              M,
              c.subTree,
              c,
              b,
              null
            );
          };
          wt && ft.__asyncHydrate ? ft.__asyncHydrate(
            M,
            c,
            vt
          ) : vt();
        } else {
          ct.ce && ct.ce._hasShadowRoot() && ct.ce._injectChildStyle(
            ft,
            c.parent ? c.parent.type : void 0
          );
          const vt = c.subTree = ks(c);
          P(
            null,
            vt,
            p,
            x,
            c,
            b,
            m
          ), a.el = vt.el;
        }
        if (Q && mt(Q, b), !wt && (O = H && H.onVnodeMounted)) {
          const vt = a;
          mt(
            () => St(O, X, vt),
            b
          );
        }
        (a.shapeFlag & 256 || X && ye(X.vnode) && X.vnode.shapeFlag & 256) && c.a && mt(c.a, b), c.isMounted = !0, __VUE_PROD_DEVTOOLS__ && Rl(c), a = p = x = null;
      }
    };
    c.scope.on();
    const v = c.effect = new yr(E);
    c.scope.off();
    const y = c.update = v.run.bind(v), R = c.job = v.runIfDirty.bind(v);
    R.i = c, R.id = c.uid, v.scheduler = () => yn(R), le(c, !0), y();
  }, G = (c, a, p) => {
    a.component = c;
    const x = c.vnode.props;
    c.vnode = a, c.next = null, Do(c, a.props, x, p), No(c, a.children, p), $t(), Fn(c), jt();
  }, k = (c, a, p, x, b, m, S, E, v = !1) => {
    const y = c && c.children, R = c ? c.shapeFlag : 0, O = a.children, { patchFlag: M, shapeFlag: H } = a;
    if (M > 0) {
      if (M & 128) {
        Z(
          y,
          O,
          p,
          x,
          b,
          m,
          S,
          E,
          v
        );
        return;
      } else if (M & 256) {
        xt(
          y,
          O,
          p,
          x,
          b,
          m,
          S,
          E,
          v
        );
        return;
      }
    }
    H & 8 ? (R & 16 && we(y, b, m), O !== y && u(p, O)) : R & 16 ? H & 16 ? Z(
      y,
      O,
      p,
      x,
      b,
      m,
      S,
      E,
      v
    ) : we(y, b, m, !0) : (R & 8 && u(p, ""), H & 16 && F(
      O,
      p,
      x,
      b,
      m,
      S,
      E,
      v
    ));
  }, xt = (c, a, p, x, b, m, S, E, v) => {
    c = c || Le, a = a || Le;
    const y = c.length, R = a.length, O = Math.min(y, R);
    let M;
    for (M = 0; M < O; M++) {
      const H = a[M] = v ? Bt(a[M]) : Ot(a[M]);
      P(
        c[M],
        H,
        p,
        null,
        b,
        m,
        S,
        E,
        v
      );
    }
    y > R ? we(
      c,
      b,
      m,
      !0,
      !1,
      O
    ) : F(
      a,
      p,
      x,
      b,
      m,
      S,
      E,
      v,
      O
    );
  }, Z = (c, a, p, x, b, m, S, E, v) => {
    let y = 0;
    const R = a.length;
    let O = c.length - 1, M = R - 1;
    for (; y <= O && y <= M; ) {
      const H = c[y], q = a[y] = v ? Bt(a[y]) : Ot(a[y]);
      if (Ie(H, q))
        P(
          H,
          q,
          p,
          null,
          b,
          m,
          S,
          E,
          v
        );
      else
        break;
      y++;
    }
    for (; y <= O && y <= M; ) {
      const H = c[O], q = a[M] = v ? Bt(a[M]) : Ot(a[M]);
      if (Ie(H, q))
        P(
          H,
          q,
          p,
          null,
          b,
          m,
          S,
          E,
          v
        );
      else
        break;
      O--, M--;
    }
    if (y > O) {
      if (y <= M) {
        const H = M + 1, q = H < R ? a[H].el : x;
        for (; y <= M; )
          P(
            null,
            a[y] = v ? Bt(a[y]) : Ot(a[y]),
            p,
            q,
            b,
            m,
            S,
            E,
            v
          ), y++;
      }
    } else if (y > M)
      for (; y <= O; )
        it(c[y], b, m, !0), y++;
    else {
      const H = y, q = y, Q = /* @__PURE__ */ new Map();
      for (y = q; y <= M; y++) {
        const Tt = a[y] = v ? Bt(a[y]) : Ot(a[y]);
        Tt.key != null && Q.set(Tt.key, y);
      }
      let X, ct = 0;
      const ft = M - q + 1;
      let wt = !1, vt = 0;
      const Ce = new Array(ft);
      for (y = 0; y < ft; y++) Ce[y] = 0;
      for (y = H; y <= O; y++) {
        const Tt = c[y];
        if (ct >= ft) {
          it(Tt, b, m, !0);
          continue;
        }
        let Dt;
        if (Tt.key != null)
          Dt = Q.get(Tt.key);
        else
          for (X = q; X <= M; X++)
            if (Ce[X - q] === 0 && Ie(Tt, a[X])) {
              Dt = X;
              break;
            }
        Dt === void 0 ? it(Tt, b, m, !0) : (Ce[Dt - q] = y + 1, Dt >= vt ? vt = Dt : wt = !0, P(
          Tt,
          a[Dt],
          p,
          null,
          b,
          m,
          S,
          E,
          v
        ), ct++);
      }
      const Mn = wt ? jo(Ce) : Le;
      for (X = Mn.length - 1, y = ft - 1; y >= 0; y--) {
        const Tt = q + y, Dt = a[Tt], In = a[Tt + 1], Rn = Tt + 1 < R ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          In.el || pi(In)
        ) : x;
        Ce[y] === 0 ? P(
          null,
          Dt,
          p,
          Rn,
          b,
          m,
          S,
          E,
          v
        ) : wt && (X < 0 || y !== Mn[X] ? at(Dt, p, Rn, 2) : X--);
      }
    }
  }, at = (c, a, p, x, b = null) => {
    const { el: m, type: S, transition: E, children: v, shapeFlag: y } = c;
    if (y & 6) {
      at(c.component.subTree, a, p, x);
      return;
    }
    if (y & 128) {
      c.suspense.move(a, p, x);
      return;
    }
    if (y & 64) {
      S.move(c, a, p, pe);
      return;
    }
    if (S === At) {
      n(m, a, p);
      for (let O = 0; O < v.length; O++)
        at(v[O], a, p, x);
      n(c.anchor, a, p);
      return;
    }
    if (S === ve) {
      d(c, a, p);
      return;
    }
    if (x !== 2 && y & 1 && E)
      if (x === 0)
        E.persisted && !m[$s] ? n(m, a, p) : (E.beforeEnter(m), n(m, a, p), mt(() => E.enter(m), b));
      else {
        const { leave: O, delayLeave: M, afterLeave: H } = E, q = () => {
          c.ctx.isUnmounted ? r(m) : n(m, a, p);
        }, Q = () => {
          const X = m._isLeaving || !!m[$s];
          m._isLeaving && m[$s](
            !0
            /* cancelled */
          ), E.persisted && !X ? q() : O(m, () => {
            q(), H && H();
          });
        };
        M ? M(m, q, Q) : Q();
      }
    else
      n(m, a, p);
  }, it = (c, a, p, x = !1, b = !1) => {
    const {
      type: m,
      props: S,
      ref: E,
      children: v,
      dynamicChildren: y,
      shapeFlag: R,
      patchFlag: O,
      dirs: M,
      cacheIndex: H,
      memo: q
    } = c;
    if (O === -2 && (b = !1), E != null && ($t(), be(E, null, p, c, !0), jt()), H != null && (a.renderCache[H] = void 0), R & 256) {
      a.ctx.deactivate(c);
      return;
    }
    const Q = R & 1 && M, X = !ye(c);
    let ct;
    if (X && (ct = S && S.onVnodeBeforeUnmount) && St(ct, a, c), R & 6)
      wi(c.component, p, x);
    else {
      if (R & 128) {
        c.suspense.unmount(p, x);
        return;
      }
      Q && Vt(c, null, a, "beforeUnmount"), R & 64 ? c.type.remove(
        c,
        a,
        p,
        pe,
        x
      ) : y && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !y.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (m !== At || O > 0 && O & 64) ? we(
        y,
        a,
        p,
        !1,
        !0
      ) : (m === At && O & 384 || !b && R & 16) && we(v, a, p), x && Ze(c);
    }
    const ft = q != null && H == null;
    (X && (ct = S && S.onVnodeUnmounted) || Q || ft) && mt(() => {
      ct && St(ct, a, c), Q && Vt(c, null, a, "unmounted"), ft && (c.el = null);
    }, p);
  }, Ze = (c) => {
    const { type: a, el: p, anchor: x, transition: b } = c;
    if (a === At) {
      Oi(p, x);
      return;
    }
    if (a === ve) {
      _(c);
      return;
    }
    const m = () => {
      r(p), b && !b.persisted && b.afterLeave && b.afterLeave();
    };
    if (c.shapeFlag & 1 && b && !b.persisted) {
      const { leave: S, delayLeave: E } = b, v = () => S(p, m);
      E ? E(c.el, m, v) : v();
    } else
      m();
  }, Oi = (c, a) => {
    let p;
    for (; c !== a; )
      p = T(c), r(c), c = p;
    r(a);
  }, wi = (c, a, p) => {
    const { bum: x, scope: b, job: m, subTree: S, um: E, m: v, a: y } = c;
    tr(v), tr(y), x && Hs(x), b.stop(), m && (m.flags |= 8, it(S, c, a, p)), E && mt(E, a), mt(() => {
      c.isUnmounted = !0;
    }, a), __VUE_PROD_DEVTOOLS__ && Hl(c);
  }, we = (c, a, p, x = !1, b = !1, m = 0) => {
    for (let S = m; S < c.length; S++)
      it(c[S], a, p, x, b);
  }, Qe = (c) => {
    if (c.shapeFlag & 6)
      return Qe(c.component.subTree);
    if (c.shapeFlag & 128)
      return c.suspense.next();
    const a = T(c.anchor || c.el), p = a && a[Br];
    return p ? T(p) : a;
  };
  let Ms = !1;
  const Pn = (c, a, p) => {
    let x;
    c == null ? a._vnode && (it(a._vnode, null, null, !0), x = a._vnode.component) : P(
      a._vnode || null,
      c,
      a,
      null,
      null,
      null,
      p
    ), a._vnode = c, Ms || (Ms = !0, Fn(x), as(), Ms = !1);
  }, pe = {
    p: P,
    um: it,
    m: at,
    r: Ze,
    mt: rt,
    mc: F,
    pc: k,
    pbc: Y,
    n: Qe,
    o: t
  };
  let Is, Rs;
  return e && ([Is, Rs] = e(
    pe
  )), {
    render: Pn,
    hydrate: Is,
    createApp: Ao(Pn, Is)
  };
}
function Ks({ type: t, props: e }, s) {
  return s === "svg" && t === "foreignObject" || s === "mathml" && t === "annotation-xml" && e && e.encoding && e.encoding.includes("html") ? void 0 : s;
}
function le({ effect: t, job: e }, s) {
  s ? (t.flags |= 32, e.flags |= 4) : (t.flags &= -33, e.flags &= -5);
}
function hi(t, e) {
  return (!t || t && !t.pendingBranch) && e && !e.persisted;
}
function On(t, e, s = !1) {
  const n = t.children, r = e.children;
  if (j(n) && j(r))
    for (let i = 0; i < n.length; i++) {
      const l = n[i];
      let o = r[i];
      o.shapeFlag & 1 && !o.dynamicChildren && ((o.patchFlag <= 0 || o.patchFlag === 32) && (o = r[i] = Bt(r[i]), o.el = l.el), !s && o.patchFlag !== -2 && On(l, o)), o.type === ee && (o.patchFlag === -1 && (o = r[i] = Bt(o)), o.el = l.el), o.type === zt && !o.el && (o.el = l.el);
    }
}
function jo(t) {
  const e = t.slice(), s = [0];
  let n, r, i, l, o;
  const f = t.length;
  for (n = 0; n < f; n++) {
    const h = t[n];
    if (h !== 0) {
      if (r = s[s.length - 1], t[r] < h) {
        e[n] = r, s.push(n);
        continue;
      }
      for (i = 0, l = s.length - 1; i < l; )
        o = i + l >> 1, t[s[o]] < h ? i = o + 1 : l = o;
      h < t[s[i]] && (i > 0 && (e[n] = s[i - 1]), s[i] = n);
    }
  }
  for (i = s.length, l = s[i - 1]; i-- > 0; )
    s[i] = l, l = e[l];
  return s;
}
function di(t) {
  const e = t.subTree.component;
  if (e)
    return e.asyncDep && !e.asyncResolved ? e : di(e);
}
function tr(t) {
  if (t)
    for (let e = 0; e < t.length; e++)
      t[e].flags |= 8;
}
function pi(t) {
  if (t.placeholder)
    return t.placeholder;
  const e = t.component;
  return e ? pi(e.subTree) : null;
}
const gi = (t) => t.__isSuspense;
function _i(t, e) {
  e && e.pendingBranch ? j(t) ? e.effects.push(...t) : e.effects.push(t) : Pl(t);
}
const At = /* @__PURE__ */ Symbol.for("v-fgt"), ee = /* @__PURE__ */ Symbol.for("v-txt"), zt = /* @__PURE__ */ Symbol.for("v-cmt"), ve = /* @__PURE__ */ Symbol.for("v-stc"), Te = [];
let Yt = null;
function ko() {
  Te.pop(), Yt = Te[Te.length - 1] || null;
}
let wn = 1;
function gs(t, e = !1) {
  wn += t, t < 0 && Yt && e && (Yt.hasOnce = !0);
}
function _s(t) {
  return t ? t.__v_isVNode === !0 : !1;
}
function Ie(t, e) {
  return t.type === e.type && t.key === e.key;
}
const mi = ({ key: t }) => t ?? null, os = ({
  ref: t,
  ref_key: e,
  ref_for: s
}) => (typeof t == "number" && (t = "" + t), t != null ? st(t) || /* @__PURE__ */ dt(t) || $(t) ? { i: Ft, r: t, k: e, f: !!s } : t : null);
function Ko(t, e = null, s = null, n = 0, r = null, i = t === At ? 0 : 1, l = !1, o = !1) {
  const f = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: t,
    props: e,
    key: e && mi(e),
    ref: e && os(e),
    scopeId: jr,
    slotScopeIds: null,
    children: s,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag: i,
    patchFlag: n,
    dynamicProps: r,
    dynamicChildren: null,
    appContext: null,
    ctx: Ft
  };
  return o ? (ms(f, s), i & 128 && t.normalize(f)) : s && (f.shapeFlag |= st(s) ? 8 : 16), wn > 0 && // avoid a block node from tracking itself
  !l && // has current parent block
  Yt && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (f.patchFlag > 0 || i & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  f.patchFlag !== 32 && Yt.push(f), f;
}
const Et = Bo;
function Bo(t, e = null, s = null, n = 0, r = null, i = !1) {
  if ((!t || t === mo) && (t = zt), _s(t)) {
    const o = Se(
      t,
      e,
      !0
      /* mergeRef: true */
    );
    return s && ms(o, s), wn > 0 && !i && Yt && (o.shapeFlag & 6 ? Yt[Yt.indexOf(t)] = o : Yt.push(o)), o.patchFlag = -2, o;
  }
  if (rc(t) && (t = t.__vccOpts), e) {
    e = Wo(e);
    let { class: o, style: f } = e;
    o && !st(o) && (e.class = Ts(o)), nt(f) && (/* @__PURE__ */ bn(f) && !j(f) && (f = pt({}, f)), e.style = vs(f));
  }
  const l = st(t) ? 1 : gi(t) ? 128 : ws(t) ? 64 : nt(t) ? 4 : $(t) ? 2 : 0;
  return Ko(
    t,
    e,
    s,
    n,
    r,
    l,
    i,
    !0
  );
}
function Wo(t) {
  return t ? /* @__PURE__ */ bn(t) || ii(t) ? pt({}, t) : t : null;
}
function Se(t, e, s = !1, n = !1) {
  const { props: r, ref: i, patchFlag: l, children: o, transition: f } = t, h = e ? Yo(r || {}, e) : r, u = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: t.type,
    props: h,
    key: h && mi(h),
    ref: e && e.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      s && i ? j(i) ? i.concat(os(e)) : [i, os(e)] : os(e)
    ) : i,
    scopeId: t.scopeId,
    slotScopeIds: t.slotScopeIds,
    children: o,
    target: t.target,
    targetStart: t.targetStart,
    targetAnchor: t.targetAnchor,
    staticCount: t.staticCount,
    shapeFlag: t.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: e && t.type !== At ? l === -1 ? 16 : l | 16 : l,
    dynamicProps: t.dynamicProps,
    dynamicChildren: t.dynamicChildren,
    appContext: t.appContext,
    dirs: t.dirs,
    transition: f,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: t.component,
    suspense: t.suspense,
    ssContent: t.ssContent && Se(t.ssContent),
    ssFallback: t.ssFallback && Se(t.ssFallback),
    placeholder: t.placeholder,
    el: t.el,
    anchor: t.anchor,
    ctx: t.ctx,
    ce: t.ce
  };
  return f && n && vn(
    u,
    f.clone(u)
  ), u;
}
function bi(t = " ", e = 0) {
  return Et(ee, null, t, e);
}
function Ot(t) {
  return t == null || typeof t == "boolean" ? Et(zt) : j(t) ? Et(
    At,
    null,
    // #3666, avoid reference pollution when reusing vnode
    t.slice()
  ) : _s(t) ? Bt(t) : Et(ee, null, String(t));
}
function Bt(t) {
  return t.el === null && t.patchFlag !== -1 || t.memo ? t : Se(t);
}
function ms(t, e) {
  let s = 0;
  const { shapeFlag: n } = t;
  if (e == null)
    e = null;
  else if (j(e))
    s = 16;
  else if (typeof e == "object")
    if (n & 65) {
      const r = e.default;
      r && (r._c && (r._d = !1), ms(t, r()), r._c && (r._d = !0));
      return;
    } else {
      s = 32;
      const r = e._;
      !r && !ii(e) ? e._ctx = Ft : r === 3 && Ft && (Ft.slots._ === 1 ? e._ = 1 : (e._ = 2, t.patchFlag |= 1024));
    }
  else if ($(e)) {
    if (n & 65) {
      ms(t, { default: e });
      return;
    }
    e = { default: e, _ctx: Ft }, s = 32;
  } else
    e = String(e), n & 64 ? (s = 16, e = [bi(e)]) : s = 8;
  t.children = e, t.shapeFlag |= s;
}
function Yo(...t) {
  const e = {};
  for (let s = 0; s < t.length; s++) {
    const n = t[s];
    for (const r in n)
      if (r === "class")
        e.class !== n.class && (e.class = Ts([e.class, n.class]));
      else if (r === "style")
        e.style = vs([e.style, n.style]);
      else if (ze(r)) {
        const i = e[r], l = n[r];
        l && i !== l && !(j(i) && i.includes(l)) ? e[r] = i ? [].concat(i, l) : l : l == null && i == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !ys(r) && (e[r] = l);
      } else r !== "" && (e[r] = n[r]);
  }
  return e;
}
function St(t, e, s, n = null) {
  Rt(t, e, 7, [
    s,
    n
  ]);
}
const qo = Qr();
let Go = 0;
function zo(t, e, s) {
  const n = t.type, r = (e ? e.appContext : t.appContext) || qo, i = {
    uid: Go++,
    vnode: t,
    type: n,
    parent: e,
    appContext: r,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new qi(
      !0
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: e ? e.provides : Object.create(r.provides),
    ids: e ? e.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: oi(n, r),
    emitsOptions: ti(n, r),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: et,
    // inheritAttrs
    inheritAttrs: n.inheritAttrs,
    // state
    ctx: et,
    data: et,
    props: et,
    attrs: et,
    slots: et,
    refs: et,
    setupState: et,
    setupContext: null,
    // suspense related
    suspense: s,
    suspenseId: s ? s.pendingId : 0,
    asyncDep: null,
    asyncResolved: !1,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: !1,
    isUnmounted: !1,
    isDeactivated: !1,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  return i.ctx = { _: i }, i.root = e ? e.root : i, i.emit = wo.bind(null, i), t.ce && t.ce(i), i;
}
let yt = null;
const Jo = () => yt || Ft;
let bs, qe;
{
  const t = ue(), e = (s, n) => {
    let r;
    return (r = t[s]) || (r = t[s] = []), r.push(n), (i) => {
      r.length > 1 ? r.forEach((l) => l(i)) : r[0](i);
    };
  };
  bs = e(
    "__VUE_INSTANCE_SETTERS__",
    (s) => yt = s
  ), qe = e(
    "__VUE_SSR_SETTERS__",
    (s) => Ge = s
  );
}
const Xe = (t) => {
  const e = yt;
  return bs(t), t.scope.on(), () => {
    t.scope.off(), bs(e);
  };
}, er = () => {
  yt && yt.scope.off(), bs(null);
};
function yi(t) {
  return t.vnode.shapeFlag & 4;
}
let Ge = !1;
function Xo(t, e = !1, s = !1) {
  e && qe(e);
  const { props: n, children: r } = t.vnode, i = yi(t);
  Ro(t, n, i, e), Lo(t, r, s || e);
  const l = i ? Zo(t, e) : void 0;
  return e && qe(!1), l;
}
function Zo(t, e) {
  const s = t.type;
  t.accessCache = /* @__PURE__ */ Object.create(null), t.proxy = new Proxy(t.ctx, bo);
  const { setup: n } = s;
  if (n) {
    $t();
    const r = t.setupContext = n.length > 1 ? tc(t) : null, i = Xe(t), l = Oe(
      n,
      t,
      0,
      [
        t.props,
        r
      ]
    ), o = gr(l);
    if (jt(), i(), (o || t.sp) && !ye(t) && Yr(t), o) {
      if (l.then(er, er), e)
        return l.then((f) => {
          qe(!0);
          try {
            sr(t, f, e);
          } finally {
            qe(!1);
          }
        }).catch((f) => {
          As(f, t, 0);
        });
      t.asyncDep = l;
    } else
      sr(t, l);
  } else
    xi(t);
}
function sr(t, e, s) {
  $(e) ? t.type.__ssrInlineRender ? t.ssrRender = e : t.render = e : nt(e) && (__VUE_PROD_DEVTOOLS__ && (t.devtoolsRawSetupState = e), t.setupState = Hr(e)), xi(t);
}
function xi(t, e, s) {
  const n = t.type;
  if (t.render || (t.render = n.render || Ct), __VUE_OPTIONS_API__) {
    const r = Xe(t);
    $t();
    try {
      yo(t);
    } finally {
      jt(), r();
    }
  }
}
const Qo = {
  get(t, e) {
    return gt(t, "get", ""), t[e];
  }
};
function tc(t) {
  const e = (s) => {
    t.exposed = s || {};
  };
  return {
    attrs: new Proxy(t.attrs, Qo),
    slots: t.slots,
    emit: t.emit,
    expose: e
  };
}
function Cn(t) {
  return t.exposed ? t.exposeProxy || (t.exposeProxy = new Proxy(Hr(dl(t.exposed)), {
    get(e, s) {
      if (s in e)
        return e[s];
      if (s in je)
        return je[s](t);
    },
    has(e, s) {
      return s in e || s in je;
    }
  })) : t.proxy;
}
const ec = /(?:^|[-_])\w/g, sc = (t) => t.replace(ec, (e) => e.toUpperCase()).replace(/[-_]/g, "");
function nc(t, e = !0) {
  return $(t) ? t.displayName || t.name : t.name || e && t.__name;
}
function vi(t, e, s = !1) {
  let n = nc(e);
  if (!n && e.__file) {
    const r = e.__file.match(/([^/\\]+)\.\w+$/);
    r && (n = r[1]);
  }
  if (!n && t) {
    const r = (i) => {
      for (const l in i)
        if (i[l] === e)
          return l;
    };
    n = r(t.components) || t.parent && r(
      t.parent.type.components
    ) || r(t.appContext.components);
  }
  return n ? sc(n) : s ? "App" : "Anonymous";
}
function rc(t) {
  return $(t) && "__vccOpts" in t;
}
const ic = (t, e) => /* @__PURE__ */ yl(t, e, Ge);
function U(t, e, s) {
  try {
    gs(-1);
    const n = arguments.length;
    return n === 2 ? nt(e) && !j(e) ? _s(e) ? Et(t, null, [e]) : Et(t, e) : Et(t, null, e) : (n > 3 ? s = Array.prototype.slice.call(arguments, 2) : n === 3 && _s(s) && (s = [s]), Et(t, e, s));
  } finally {
    gs(1);
  }
}
const nr = "3.5.42";
/**
* @vue/runtime-dom v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let ln;
const rr = typeof window < "u" && window.trustedTypes;
if (rr)
  try {
    ln = /* @__PURE__ */ rr.createPolicy("vue", {
      createHTML: (t) => t
    });
  } catch {
  }
const Ti = ln ? (t) => ln.createHTML(t) : (t) => t, lc = "http://www.w3.org/2000/svg", oc = "http://www.w3.org/1998/Math/MathML", Kt = typeof document < "u" ? document : null, ir = Kt && /* @__PURE__ */ Kt.createElement("template"), cc = {
  insert: (t, e, s) => {
    e.insertBefore(t, s || null);
  },
  remove: (t) => {
    const e = t.parentNode;
    e && e.removeChild(t);
  },
  createElement: (t, e, s, n) => {
    const r = e === "svg" ? Kt.createElementNS(lc, t) : e === "mathml" ? Kt.createElementNS(oc, t) : s ? Kt.createElement(t, { is: s }) : Kt.createElement(t);
    return t === "select" && n && n.multiple != null && r.setAttribute("multiple", n.multiple), r;
  },
  createText: (t) => Kt.createTextNode(t),
  createComment: (t) => Kt.createComment(t),
  setText: (t, e) => {
    t.nodeValue = e;
  },
  setElementText: (t, e) => {
    t.textContent = e;
  },
  parentNode: (t) => t.parentNode,
  nextSibling: (t) => t.nextSibling,
  querySelector: (t) => Kt.querySelector(t),
  setScopeId(t, e) {
    t.setAttribute(e, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(t, e, s, n, r, i) {
    const l = s ? s.previousSibling : e.lastChild;
    if (r && (r === i || r.nextSibling))
      for (; e.insertBefore(r.cloneNode(!0), s), !(r === i || !(r = r.nextSibling)); )
        ;
    else {
      ir.innerHTML = Ti(
        n === "svg" ? `<svg>${t}</svg>` : n === "mathml" ? `<math>${t}</math>` : t
      );
      const o = ir.content;
      if (n === "svg" || n === "mathml") {
        const f = o.firstChild;
        for (; f.firstChild; )
          o.appendChild(f.firstChild);
        o.removeChild(f);
      }
      e.insertBefore(o, s);
    }
    return [
      // first
      l ? l.nextSibling : e.firstChild,
      // last
      s ? s.previousSibling : e.lastChild
    ];
  }
}, fc = /* @__PURE__ */ Symbol("_vtc");
function ac(t, e, s) {
  const n = t[fc];
  n && (e = (e ? [e, ...n] : [...n]).join(" ")), e == null ? t.removeAttribute("class") : s ? t.setAttribute("class", e) : t.className = e;
}
const lr = /* @__PURE__ */ Symbol("_vod"), uc = /* @__PURE__ */ Symbol("_vsh"), hc = /* @__PURE__ */ Symbol(""), dc = /(?:^|;)\s*display\s*:/;
function pc(t, e, s) {
  const n = t.style, r = st(s);
  let i = !1;
  if (s && !r) {
    if (e)
      if (st(e))
        for (const l of e.split(";")) {
          const o = l.slice(0, l.indexOf(":")).trim();
          s[o] == null && Ve(n, o, "");
        }
      else
        for (const l in e)
          s[l] == null && Ve(n, l, "");
    for (const l in s) {
      l === "display" && (i = !0);
      const o = s[l];
      o != null ? _c(
        t,
        l,
        !st(e) && e ? e[l] : void 0,
        o
      ) || Ve(n, l, o) : Ve(n, l, "");
    }
  } else if (r) {
    if (e !== s) {
      const l = n[hc];
      l && (s += ";" + l), n.cssText = s, i = dc.test(s);
    }
  } else e && t.removeAttribute("style");
  lr in t && (t[lr] = i ? n.display : "", t[uc] && (n.display = "none"));
}
const is = /\s*!important$/;
function Ve(t, e, s) {
  if (j(s))
    s.forEach((n) => Ve(t, e, n));
  else if (s == null && (s = ""), e.startsWith("--"))
    is.test(s) ? t.setProperty(e, s.replace(is, ""), "important") : t.setProperty(e, s);
  else {
    const n = gc(t, e);
    is.test(s) ? t.setProperty(
      re(n),
      s.replace(is, ""),
      "important"
    ) : t[n] = s;
  }
}
const or = ["Webkit", "Moz", "ms"], Bs = {};
function gc(t, e) {
  const s = Bs[e];
  if (s)
    return s;
  let n = Pt(e);
  if (n !== "filter" && n in t)
    return Bs[e] = n;
  n = _r(n);
  for (let r = 0; r < or.length; r++) {
    const i = or[r] + n;
    if (i in t)
      return Bs[e] = i;
  }
  return e;
}
function _c(t, e, s, n) {
  return t.tagName === "TEXTAREA" && (e === "width" || e === "height") && st(n) && s === n;
}
const cr = "http://www.w3.org/1999/xlink";
function fr(t, e, s, n, r, i = $i(e)) {
  n && e.startsWith("xlink:") ? s == null ? t.removeAttributeNS(cr, e.slice(6, e.length)) : t.setAttributeNS(cr, e, s) : s == null || i && !Es(s) ? t.removeAttribute(e) : t.setAttribute(
    e,
    i ? "" : se(s) ? String(s) : s
  );
}
function ar(t, e, s, n, r) {
  if (e === "innerHTML" || e === "textContent") {
    s != null && (t[e] = e === "innerHTML" ? Ti(s) : s);
    return;
  }
  const i = t.tagName;
  if (e === "value" && i !== "PROGRESS" && // custom elements may use _value internally
  !i.includes("-")) {
    const o = i === "OPTION" ? t.getAttribute("value") || "" : t.value, f = s == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      t.type === "checkbox" ? "on" : ""
    ) : String(s);
    (o !== f || !("_value" in t)) && (t.value = f), s == null && t.removeAttribute(e), t._value = s;
    return;
  }
  let l = !1;
  if (s === "" || s == null) {
    const o = typeof t[e];
    o === "boolean" ? s = Es(s) : s == null && o === "string" ? (s = "", l = !0) : o === "number" && (s = 0, l = !0);
  }
  try {
    t[e] = s;
  } catch {
  }
  l && t.removeAttribute(r || e);
}
function mc(t, e, s, n) {
  t.addEventListener(e, s, n);
}
function bc(t, e, s, n) {
  t.removeEventListener(e, s, n);
}
const ur = /* @__PURE__ */ Symbol("_vei");
function yc(t, e, s, n, r = null) {
  const i = t[ur] || (t[ur] = {}), l = i[e];
  if (n && l)
    l.value = n;
  else {
    const [o, f] = Tc(e);
    if (n) {
      const h = i[e] = Ac(
        n,
        r
      );
      mc(t, o, h, f);
    } else l && (bc(t, o, l, f), i[e] = void 0);
  }
}
const xc = /(Once|Passive|Capture)$/, vc = /^on:?(?:Once|Passive|Capture)$/;
function Tc(t) {
  let e, s;
  for (; (s = t.match(xc)) && !vc.test(t); )
    e || (e = {}), t = t.slice(0, t.length - s[1].length), e[s[1].toLowerCase()] = !0;
  return [t[2] === ":" ? t.slice(3) : re(t.slice(2)), e];
}
let Ws = 0;
const Ec = /* @__PURE__ */ Promise.resolve(), Sc = () => Ws || (Ec.then(() => Ws = 0), Ws = Date.now());
function Ac(t, e) {
  const s = (n) => {
    if (!n._vts)
      n._vts = Date.now();
    else if (n._vts <= s.attached)
      return;
    const r = s.value;
    if (j(r)) {
      const i = n.stopImmediatePropagation;
      n.stopImmediatePropagation = () => {
        i.call(n), n._stopped = !0;
      };
      const l = r.slice(), o = [n];
      for (let f = 0; f < l.length && !n._stopped; f++) {
        const h = l[f];
        h && Rt(
          h,
          e,
          5,
          o
        );
      }
    } else
      Rt(
        r,
        e,
        5,
        [n]
      );
  };
  return s.value = t, s.attached = Sc(), s;
}
const hr = (t) => t.charCodeAt(0) === 111 && t.charCodeAt(1) === 110 && // lowercase letter
t.charCodeAt(2) > 96 && t.charCodeAt(2) < 123, Oc = (t, e, s, n, r, i) => {
  const l = r === "svg";
  e === "class" ? ac(t, n, l) : e === "style" ? pc(t, s, n) : ze(e) ? ys(e) || yc(t, e, s, n, i) : (e[0] === "." ? (e = e.slice(1), !0) : e[0] === "^" ? (e = e.slice(1), !1) : wc(t, e, n, l)) ? (ar(t, e, n), !t.tagName.includes("-") && (e === "value" || e === "checked" || e === "selected") && fr(t, e, n, l, i, e !== "value")) : /* #11081 force set props for possible async custom element */ t._isVueCE && // #12408 check if it's declared prop or it's async custom element
  (Cc(t, e) || // @ts-expect-error _def is private
  t._def.__asyncLoader && (/[A-Z]/.test(e) || !st(n))) ? ar(t, Pt(e), n, i, e) : (e === "true-value" ? t._trueValue = n : e === "false-value" && (t._falseValue = n), fr(t, e, n, l));
};
function wc(t, e, s, n) {
  if (n)
    return !!(e === "innerHTML" || e === "textContent" || e in t && hr(e) && $(s));
  if (e === "spellcheck" || e === "draggable" || e === "translate" || e === "autocorrect" || e === "sandbox" && t.tagName === "IFRAME" || e === "form" || e === "list" && t.tagName === "INPUT" || e === "type" && t.tagName === "TEXTAREA")
    return !1;
  if (e === "width" || e === "height") {
    const r = t.tagName;
    if (r === "IMG" || r === "VIDEO" || r === "CANVAS" || r === "SOURCE")
      return !1;
  }
  return hr(e) && st(s) ? !1 : e in t;
}
function Cc(t, e) {
  const s = (
    // @ts-expect-error _def is private
    t._def.props
  );
  if (!s)
    return !1;
  const n = Pt(e);
  return Array.isArray(s) ? s.some((r) => Pt(r) === n) : Object.keys(s).some((r) => Pt(r) === n);
}
const Ei = /* @__PURE__ */ pt({ patchProp: Oc }, cc);
let ke, dr = !1;
function Pc() {
  return ke || (ke = Fo(Ei));
}
function Mc() {
  return ke = dr ? ke : $o(Ei), dr = !0, ke;
}
const Ic = (...t) => {
  const e = Pc().createApp(...t), { mount: s } = e;
  return e.mount = (n) => {
    const r = Ai(n);
    if (!r) return;
    const i = e._component;
    !$(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = "");
    const l = s(r, !1, Si(r));
    return r instanceof Element && (r.removeAttribute("v-cloak"), r.setAttribute("data-v-app", "")), l;
  }, e;
}, Rc = (...t) => {
  const e = Mc().createApp(...t), { mount: s } = e;
  return e.mount = (n) => {
    const r = Ai(n);
    if (r)
      return s(r, !0, Si(r));
  }, e;
};
function Si(t) {
  if (t instanceof SVGElement)
    return "svg";
  if (typeof MathMLElement == "function" && t instanceof MathMLElement)
    return "mathml";
}
function Ai(t) {
  return st(t) ? document.querySelector(t) : t;
}
function Dc(t) {
  const { appId: e, rootComponent: s, styles: n } = t;
  return {
    name: e,
    inject: ["lifecycle", "monitor", "style"],
    apply(r) {
      for (const i of n ?? [])
        r.style.inject(r, i);
      r.effect(() => {
        const i = r.lifecycle.containerOf(r);
        if (!i)
          throw new Error(`adapter: no container for app "${e}" (mount outside lifecycle transaction?)`);
        const o = i.dataset.txSsr === "1" ? Rc(s) : Ic(s);
        return o.config.errorHandler = (f) => {
          r.monitor.capture(f, { appId: e, phase: "runtime" });
        }, o.mount(i), () => {
          o.unmount(), i.childElementCount > 0 && (r.monitor.capture(
            new Error(`adapter: container not empty after unmount (${i.childElementCount} nodes)`),
            { appId: e, phase: "runtime" }
          ), i.replaceChildren());
        };
      });
    }
  };
}
const on = "vite", qt = { ctx: null }, Hc = /* @__PURE__ */ Yl({
  name: "ViteRoot",
  setup() {
    const t = /* @__PURE__ */ Dr("home");
    qt.setPage = (n) => t.value = n;
    const e = [
      ["home", "首页"],
      ["dialog", "弹窗"],
      ["location", "路由"],
      ["contact", "通信"]
    ], s = (n) => {
      t.value = n, qt.ctx?.bus.broadcast(qt.ctx, { type: "sub-route-change", payload: { name: on, path: `/${n}` } });
    };
    return () => U("div", null, [
      U(
        "nav",
        { class: "txvt-nav" },
        e.map(
          ([n, r]) => U("button", { class: t.value === n ? "on" : "", onClick: () => s(n) }, r)
        )
      ),
      U("div", { class: "txvt-page" }, [
        t.value === "home" && U(Vc),
        t.value === "dialog" && U(Lc),
        t.value === "location" && U(Nc),
        t.value === "contact" && U(Uc)
      ])
    ]);
  }
}), Vc = {
  setup() {
    return () => U("div", null, [
      U("h2", null, "vite 示例"),
      U("p", null, [
        "本子应用由 ",
        U("b", null, "Vite lib mode"),
        " 独立构建（构建工具差异化）——产物与 esbuild 子应用同形态：自包含 ESM（default export = taixu Plugin）。"
      ]),
      U("p", null, "页面目录：弹窗 / 路由 / 通信。")
    ]);
  }
}, Lc = {
  setup() {
    const t = /* @__PURE__ */ Dr(!1);
    return () => U("div", null, [
      U("h2", null, "弹窗处理"),
      U("p", null, "弹窗无需子应用做任何处理就可使用（Teleport 挂 body）。"),
      U("h3", null, "1. 打开弹窗"),
      U("button", { class: "txvt-btn", onClick: () => t.value = !0 }, "Open Modal"),
      U("h3", null, "2. 下拉选择器"),
      U(
        "select",
        { class: "txvt-select" },
        ["Jack", "Lucy", "Tom"].map((e) => U("option", { key: e }, e))
      ),
      t.value && U(
        Bl,
        { to: "body" },
        () => U(
          "div",
          { class: "txvt-overlay", onClick: () => t.value = !1 },
          U(
            "div",
            { class: "txvt-modal", onClick: (e) => e.stopPropagation() },
            [
              U("h3", null, "Basic Modal"),
              U("p", null, "弹窗内容（渲染在 body 下）"),
              U("div", { style: { textAlign: "right", marginTop: "14px" } }, [
                U("button", { class: "txvt-btn", onClick: () => t.value = !1 }, "OK")
              ])
            ]
          )
        )
      )
    ]);
  }
}, Nc = {
  setup() {
    const t = window.location.host;
    return () => U("div", null, [
      U("h2", null, "location 处理"),
      U("h3", null, "1. 获取 window.location.host 的值"),
      U("blockquote", null, U("b", null, t)),
      U("p", null, "taixu 子应用与宿主同文档，location 直读真实地址——无需劫持回填。"),
      U("h3", null, "2. 修改 window.location.href"),
      U(
        "button",
        { class: "txvt-btn warn", onClick: () => window.location.href = "https://github.com/taixu-micro" },
        "跳转 taixu 仓库"
      )
    ]);
  }
}, Uc = {
  setup() {
    return () => U("div", null, [
      U("h2", null, "通信处理"),
      U("h3", null, "1. 宿主导航能力（= props.jump）"),
      U(
        "button",
        {
          class: "txvt-btn",
          onClick: () => qt.ctx?.bus.broadcast(qt.ctx, { type: "navigate", payload: { name: "react16" } })
        },
        "点击跳转 react16"
      ),
      U("h3", null, "2. 调用宿主全局方法"),
      U("button", { class: "txvt-btn", onClick: () => window.alert("子应用直接调用 window.alert") }, "显示 alert"),
      U("h3", null, "3. bus 去中心化事件"),
      U(
        "button",
        {
          class: "txvt-btn",
          onClick: () => qt.ctx?.bus.broadcast(qt.ctx, { type: "click", payload: "vite" })
        },
        "显示 alert（bus）"
      )
    ]);
  }
}, $c = {
  name: on,
  inject: ["lifecycle", "bus", "monitor", "style"],
  apply(t) {
    t.style.inject(t, { file: "vite.css", css: Fc }), qt.ctx = t, t.on("message/receive", (e) => {
      const s = e.message;
      s?.type === "vite-router-change" && s.payload?.path && qt.setPage?.(String(s.payload.path).replace(/^\//, "") || "home");
    }), Dc({ appId: on, rootComponent: Hc }).apply(t);
  }
}, Fc = `
.txvt-nav { display:flex; gap:12px; padding:10px 4px; border-bottom:1px solid #e5e8f0; flex-wrap:wrap; }
.txvt-nav button { border:none; background:none; color:#2c3e50; font-size:15px; cursor:pointer; padding:4px 2px; }
.txvt-nav button.on { color:#646cff; font-weight:700; border-bottom:2px solid #646cff; }
.txvt-page { padding:14px 6px; }
.txvt-page h2 { margin:6px 0 12px; font-size:20px; }
.txvt-page h3 { margin:14px 0 6px; font-size:16px; border-bottom:1px solid #eaecef; padding-bottom:4px; }
.txvt-page p, .txvt-page blockquote { font-size:14px; color:#445; line-height:1.7; margin:6px 0; }
.txvt-btn { background:#646cff; color:#fff; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-size:14px; margin:4px 8px 4px 0; }
.txvt-btn.warn { background:#e6a23c; }
.txvt-select { padding:6px 10px; border:1px solid #d5daea; border-radius:6px; font-size:14px; }
.txvt-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txvt-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
`;
export {
  $c as default
};
