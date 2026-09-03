/**
* @vue/shared v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function Se(t) {
  const e = /* @__PURE__ */ Object.create(null);
  for (const s of t.split(",")) e[s] = 1;
  return (s) => s in e;
}
const et = {}, Ve = [], Ct = () => {
}, _r = () => !1, Ge = (t) => t.charCodeAt(0) === 111 && t.charCodeAt(1) === 110 && // uppercase letter
(t.charCodeAt(2) > 122 || t.charCodeAt(2) < 97), ys = (t) => t.startsWith("onUpdate:"), pt = Object.assign, an = (t, e) => {
  const s = t.indexOf(e);
  s > -1 && t.splice(s, 1);
}, Mi = Object.prototype.hasOwnProperty, J = (t, e) => Mi.call(t, e), j = Array.isArray, fe = (t) => Je(t) === "[object Map]", Ys = (t) => Je(t) === "[object Set]", Ln = (t) => Je(t) === "[object Date]", $ = (t) => typeof t == "function", st = (t) => typeof t == "string", se = (t) => typeof t == "symbol", nt = (t) => t !== null && typeof t == "object", mr = (t) => (nt(t) || $(t)) && $(t.then) && $(t.catch), Ii = Object.prototype.toString, Je = (t) => Ii.call(t), Ri = (t) => Je(t).slice(8, -1), Di = (t) => Je(t) === "[object Object]", un = (t) => st(t) && t !== "NaN" && t[0] !== "-" && "" + parseInt(t, 10) === t, ae = /* @__PURE__ */ Se(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
), xs = (t) => {
  const e = /* @__PURE__ */ Object.create(null);
  return (s) => e[s] || (e[s] = t(s));
}, Hi = /-\w/g, Pt = xs(
  (t) => t.replace(Hi, (e) => e.slice(1).toUpperCase())
), Li = /\B([A-Z])/g, re = xs(
  (t) => t.replace(Li, "-$1").toLowerCase()
), br = xs((t) => t.charAt(0).toUpperCase() + t.slice(1)), Ds = xs(
  (t) => t ? `on${br(t)}` : ""
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
}, Vi = (t) => {
  const e = parseFloat(t);
  return isNaN(e) ? t : e;
};
let Vn;
const ue = () => Vn || (Vn = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {});
function vs(t) {
  if (j(t)) {
    const e = {};
    for (let s = 0; s < t.length; s++) {
      const n = t[s], r = st(n) ? $i(n) : vs(n);
      if (r)
        for (const i in r)
          e[i] = r[i];
    }
    return e;
  } else if (st(t) || nt(t))
    return t;
}
const Ni = /;(?![^(]*\))/g, Ui = /:([^]+)/, Fi = /\/\*[^]*?\*\//g;
function $i(t) {
  const e = {};
  return t.replace(Fi, "").split(Ni).forEach((s) => {
    if (s) {
      const n = s.split(Ui);
      n.length > 1 && (e[n[0].trim()] = n[1].trim());
    }
  }), e;
}
function ji(t) {
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
const yr = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", ki = /* @__PURE__ */ Se(yr), Nn = /* @__PURE__ */ Se(
  yr + ",async,autofocus,autoplay,controls,default,defer,disabled,inert,loop,open,required,reversed,scoped,seamless,checked,muted,multiple,selected"
);
function Es(t) {
  return !!t || t === "";
}
const Ki = /* @__PURE__ */ Se(
  "accept,accept-charset,accesskey,action,align,allow,alt,async,autocapitalize,autocomplete,autofocus,autoplay,background,bgcolor,border,buffered,capture,challenge,charset,checked,cite,class,code,codebase,color,cols,colspan,content,contenteditable,contextmenu,controls,coords,crossorigin,csp,data,datetime,decoding,default,defer,dir,dirname,disabled,download,draggable,dropzone,enctype,enterkeyhint,for,form,formaction,formenctype,formmethod,formnovalidate,formtarget,headers,height,hidden,high,href,hreflang,http-equiv,icon,id,importance,inert,integrity,ismap,itemprop,keytype,kind,label,lang,language,loading,list,loop,low,manifest,max,maxlength,minlength,media,min,multiple,muted,name,novalidate,open,optimum,pattern,ping,placeholder,poster,preload,radiogroup,readonly,referrerpolicy,rel,required,reversed,rows,rowspan,sandbox,scope,scoped,selected,shape,size,sizes,slot,span,spellcheck,src,srcdoc,srclang,srcset,start,step,style,summary,tabindex,target,title,translate,type,usemap,value,width,wrap"
), Bi = /* @__PURE__ */ Se(
  "xmlns,accent-height,accumulate,additive,alignment-baseline,alphabetic,amplitude,arabic-form,ascent,attributeName,attributeType,azimuth,baseFrequency,baseline-shift,baseProfile,bbox,begin,bias,by,calcMode,cap-height,class,clip,clipPathUnits,clip-path,clip-rule,color,color-interpolation,color-interpolation-filters,color-profile,color-rendering,contentScriptType,contentStyleType,crossorigin,cursor,cx,cy,d,decelerate,descent,diffuseConstant,direction,display,divisor,dominant-baseline,dur,dx,dy,edgeMode,elevation,enable-background,end,exponent,fill,fill-opacity,fill-rule,filter,filterRes,filterUnits,flood-color,flood-opacity,font-family,font-size,font-size-adjust,font-stretch,font-style,font-variant,font-weight,format,from,fr,fx,fy,g1,g2,glyph-name,glyph-orientation-horizontal,glyph-orientation-vertical,glyphRef,gradientTransform,gradientUnits,hanging,height,href,hreflang,horiz-adv-x,horiz-origin-x,id,ideographic,image-rendering,in,in2,intercept,k,k1,k2,k3,k4,kernelMatrix,kernelUnitLength,kerning,keyPoints,keySplines,keyTimes,lang,lengthAdjust,letter-spacing,lighting-color,limitingConeAngle,local,marker-end,marker-mid,marker-start,markerHeight,markerUnits,markerWidth,mask,maskContentUnits,maskUnits,mathematical,max,media,method,min,mode,name,numOctaves,offset,opacity,operator,order,orient,orientation,origin,overflow,overline-position,overline-thickness,panose-1,paint-order,path,pathLength,patternContentUnits,patternTransform,patternUnits,ping,pointer-events,points,pointsAtX,pointsAtY,pointsAtZ,preserveAlpha,preserveAspectRatio,primitiveUnits,r,radius,referrerPolicy,refX,refY,rel,rendering-intent,repeatCount,repeatDur,requiredExtensions,requiredFeatures,restart,result,rotate,rx,ry,scale,seed,shape-rendering,slope,spacing,specularConstant,specularExponent,speed,spreadMethod,startOffset,stdDeviation,stemh,stemv,stitchTiles,stop-color,stop-opacity,strikethrough-position,strikethrough-thickness,string,stroke,stroke-dasharray,stroke-dashoffset,stroke-linecap,stroke-linejoin,stroke-miterlimit,stroke-opacity,stroke-width,style,surfaceScale,systemLanguage,tabindex,tableValues,target,targetX,targetY,text-anchor,text-decoration,text-rendering,textLength,to,transform,transform-origin,type,u1,u2,underline-position,underline-thickness,unicode,unicode-bidi,unicode-range,units-per-em,v-alphabetic,v-hanging,v-ideographic,v-mathematical,values,vector-effect,version,vert-adv-y,vert-origin-x,vert-origin-y,viewBox,viewTarget,visibility,width,widths,word-spacing,writing-mode,x,x-height,x1,x2,xChannelSelector,xlink:actuate,xlink:arcrole,xlink:href,xlink:role,xlink:show,xlink:title,xlink:type,xmlns:xlink,xml:base,xml:lang,xml:space,y,y1,y2,yChannelSelector,z,zoomAndPan"
);
function xr(t) {
  if (t == null)
    return !1;
  const e = typeof t;
  return e === "string" || e === "number" || e === "boolean";
}
const Wi = /[ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g;
function Yi(t, e) {
  return t.replace(
    Wi,
    (s) => `\\${s}`
  );
}
function qi(t, e) {
  if (t.length !== e.length) return !1;
  let s = !0;
  for (let n = 0; s && n < t.length; n++)
    s = ws(t[n], e[n]);
  return s;
}
function Un(t, e) {
  if (t.size !== e.size) return !1;
  const s = Array.from(e), n = new Uint8Array(s.length);
  for (const r of t) {
    let i = -1;
    for (let l = 0; l < s.length; l++)
      if (!n[l] && ws(r, s[l])) {
        i = l;
        break;
      }
    if (i < 0) return !1;
    n[i] = 1;
  }
  return !0;
}
function ws(t, e) {
  if (t === e) return !0;
  let s = Ln(t), n = Ln(e);
  if (s || n)
    return s && n ? t.getTime() === e.getTime() : !1;
  if (s = se(t), n = se(e), s || n)
    return t === e;
  if (s = j(t), n = j(e), s || n)
    return s && n ? qi(t, e) : !1;
  if (s = nt(t), n = nt(e), s || n) {
    if (!s || !n)
      return !1;
    if (s = fe(t), n = fe(e), s || n || (s = Ys(t), n = Ys(e), s || n))
      return s && n ? Un(t, e) : !1;
    const r = Object.keys(t).length, i = Object.keys(e).length;
    if (r !== i)
      return !1;
    for (const l in t) {
      const o = t.hasOwnProperty(l), f = e.hasOwnProperty(l);
      if (o && !f || !o && f || !ws(t[l], e[l]))
        return !1;
    }
  }
  return String(t) === String(e);
}
function zi(t) {
  return t == null ? "initial" : typeof t == "string" ? t === "" ? " " : t : String(t);
}
/**
* @vue/reactivity v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let dt;
class Gi {
  // TODO isolatedDeclarations "__v_skip"
  constructor(e = !1) {
    this.detached = e, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !e && dt && (dt.active ? (this.parent = dt, this.index = (dt.scopes || (dt.scopes = [])).push(
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
      const s = dt;
      try {
        return dt = this, e();
      } finally {
        dt = s;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    ++this._on === 1 && (this.prevScope = dt, dt = this);
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (dt === this)
        dt = this.prevScope;
      else {
        let e = dt;
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
function Ji() {
  return dt;
}
let tt;
const Ls = /* @__PURE__ */ new WeakSet();
class vr {
  constructor(e) {
    this.fn = e, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, dt && (dt.active ? dt.effects.push(this) : this.flags &= -2);
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    this.flags & 64 && (this.flags &= -65, Ls.has(this) && (Ls.delete(this), this.trigger()));
  }
  /**
   * @internal
   */
  notify() {
    this.flags & 2 && !(this.flags & 32) || this.flags & 8 || Er(this);
  }
  run() {
    if (!(this.flags & 1))
      return this.fn();
    this.flags |= 2, Fn(this), wr(this);
    const e = tt, s = Mt;
    tt = this, Mt = !0;
    try {
      return this.fn();
    } finally {
      Sr(this), tt = e, Mt = s, this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let e = this.deps; e; e = e.nextDep)
        pn(e);
      this.deps = this.depsTail = void 0, Fn(this), this.onStop && this.onStop(), this.flags &= -2;
    }
  }
  trigger() {
    this.flags & 64 ? Ls.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
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
let Tr = 0, Ne, Ue;
function Er(t, e = !1) {
  if (t.flags |= 8, e) {
    t.next = Ue, Ue = t;
    return;
  }
  t.next = Ne, Ne = t;
}
function dn() {
  Tr++;
}
function hn() {
  if (--Tr > 0)
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
function wr(t) {
  for (let e = t.deps; e; e = e.nextDep)
    e.version = -1, e.prevActiveLink = e.dep.activeLink, e.dep.activeLink = e;
}
function Sr(t) {
  let e, s = t.depsTail, n = s;
  for (; n; ) {
    const r = n.prevDep;
    n.version === -1 ? (n === s && (s = r), pn(n), Xi(n)) : e = n, n.dep.activeLink = n.prevActiveLink, n.prevActiveLink = void 0, n = r;
  }
  t.deps = e, t.depsTail = s;
}
function qs(t) {
  for (let e = t.deps; e; e = e.nextDep)
    if (e.dep.version !== e.version || e.dep.computed && (Ar(e.dep.computed) || e.dep.version !== e.version))
      return !0;
  return !!t._dirty;
}
function Ar(t) {
  if (t.flags & 4 && !(t.flags & 16) || (t.flags &= -17, t.globalVersion === Ke) || (t.globalVersion = Ke, !t.isSSR && t.flags & 128 && (!t.deps && !t._dirty || !qs(t))))
    return;
  t.flags |= 2;
  const e = t.dep, s = tt, n = Mt;
  tt = t, Mt = !0;
  try {
    wr(t);
    const r = t.fn(t._value);
    (e.version === 0 || Nt(r, t._value)) && (t.flags |= 128, t._value = r, e.version++);
  } catch (r) {
    throw e.version++, r;
  } finally {
    tt = s, Mt = n, Sr(t), t.flags &= -3;
  }
}
function pn(t, e = !1) {
  const { dep: s, prevSub: n, nextSub: r } = t;
  if (n && (n.nextSub = r, t.prevSub = void 0), r && (r.prevSub = n, t.nextSub = void 0), s.subs === t && (s.subs = n, !n && s.computed)) {
    s.computed.flags &= -5;
    for (let i = s.computed.deps; i; i = i.nextDep)
      pn(i, !0);
  }
  !e && !--s.sc && s.map && s.map.delete(s.key);
}
function Xi(t) {
  const { prevDep: e, nextDep: s } = t;
  e && (e.nextDep = s, t.prevDep = void 0), s && (s.prevDep = e, t.nextDep = void 0);
}
let Mt = !0;
const Or = [];
function $t() {
  Or.push(Mt), Mt = !1;
}
function jt() {
  const t = Or.pop();
  Mt = t === void 0 ? !0 : t;
}
function Fn(t) {
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
class Zi {
  constructor(e, s) {
    this.sub = e, this.dep = s, this.version = s.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class gn {
  // TODO isolatedDeclarations "__v_skip"
  constructor(e) {
    this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
  }
  track(e) {
    if (!tt || !Mt || tt === this.computed)
      return;
    let s = this.activeLink;
    if (s === void 0 || s.sub !== tt)
      s = this.activeLink = new Zi(tt, this), tt.deps ? (s.prevDep = tt.depsTail, tt.depsTail.nextDep = s, tt.depsTail = s) : tt.deps = tt.depsTail = s, Cr(s);
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
    dn();
    try {
      for (let s = this.subs; s; s = s.prevSub)
        s.sub.notify() && s.sub.dep.notify();
    } finally {
      hn();
    }
  }
}
function Cr(t) {
  if (t.dep.sc++, t.sub.flags & 4) {
    const e = t.dep.computed;
    if (e && !t.dep.subs) {
      e.flags |= 20;
      for (let n = e.deps; n; n = n.nextDep)
        Cr(n);
    }
    const s = t.dep.subs;
    s !== t && (t.prevSub = s, s && (s.nextSub = t)), t.dep.subs = t;
  }
}
const zs = /* @__PURE__ */ new WeakMap(), de = /* @__PURE__ */ Symbol(
  ""
), Gs = /* @__PURE__ */ Symbol(
  ""
), Be = /* @__PURE__ */ Symbol(
  ""
);
function gt(t, e, s) {
  if (Mt && tt) {
    let n = zs.get(t);
    n || zs.set(t, n = /* @__PURE__ */ new Map());
    let r = n.get(s);
    r || (n.set(s, r = new gn()), r.map = n, r.key = s), r.track();
  }
}
function Wt(t, e, s, n, r, i) {
  const l = zs.get(t);
  if (!l) {
    Ke++;
    return;
  }
  const o = (f) => {
    f && f.trigger();
  };
  if (dn(), e === "clear")
    l.forEach(o);
  else {
    const f = j(t), d = f && un(s);
    if (f && s === "length") {
      const u = Number(n);
      l.forEach((g, T) => {
        (T === "length" || T === Be || !se(T) && T >= u) && o(g);
      });
    } else
      switch ((s !== void 0 || l.has(void 0)) && o(l.get(s)), d && o(l.get(Be)), e) {
        case "add":
          f ? d && o(l.get("length")) : (o(l.get(de)), fe(t) && o(l.get(Gs)));
          break;
        case "delete":
          f || (o(l.get(de)), fe(t) && o(l.get(Gs)));
          break;
        case "set":
          fe(t) && o(l.get(de));
          break;
      }
  }
  hn();
}
function ge(t) {
  const e = /* @__PURE__ */ G(t);
  return e === t ? e : (gt(e, "iterate", Be), /* @__PURE__ */ It(t) ? e : e.map(zt));
}
function _n(t) {
  return gt(t = /* @__PURE__ */ G(t), "iterate", Be), t;
}
function Vt(t, e) {
  return /* @__PURE__ */ ne(t) ? We(/* @__PURE__ */ he(t) ? zt(e) : e) : zt(e);
}
const Qi = {
  __proto__: null,
  [Symbol.iterator]() {
    return Vs(this, Symbol.iterator, (t) => Vt(this, t));
  },
  concat(...t) {
    return ge(this).concat(
      ...t.map((e) => j(e) ? ge(e) : e)
    );
  },
  entries() {
    return Vs(this, "entries", (t) => (t[1] = Vt(this, t[1]), t));
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
      (s) => s.map((n) => Vt(this, n)),
      arguments
    );
  },
  find(t, e) {
    return kt(
      this,
      "find",
      t,
      e,
      (s) => Vt(this, s),
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
      (s) => Vt(this, s),
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
    return $n(this, "reduce", t, e);
  },
  reduceRight(t, ...e) {
    return $n(this, "reduceRight", t, e);
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
    return Vs(this, "values", (t) => Vt(this, t));
  }
};
function Vs(t, e, s) {
  const n = _n(t), r = n[e]();
  return n !== t && !/* @__PURE__ */ It(t) && (r._next = r.next, r.next = () => {
    const i = r._next();
    return i.done || (i.value = s(i.value)), i;
  }), r;
}
const tl = Array.prototype;
function kt(t, e, s, n, r, i) {
  const l = _n(t), o = l !== t && !/* @__PURE__ */ It(t), f = l[e];
  if (f !== tl[e]) {
    const g = f.apply(t, i);
    return o ? zt(g) : g;
  }
  let d = s;
  l !== t && (o ? d = function(g, T) {
    return s.call(this, Vt(t, g), T, t);
  } : s.length > 2 && (d = function(g, T) {
    return s.call(this, g, T, t);
  }));
  const u = f.call(l, d, n);
  return o && r ? r(u) : u;
}
function $n(t, e, s, n) {
  const r = _n(t), i = r !== t && !/* @__PURE__ */ It(t);
  let l = s, o = !1;
  r !== t && (i ? (o = n.length === 0, l = function(d, u, g) {
    return o && (o = !1, d = Vt(t, d)), s.call(this, d, Vt(t, u), g, t);
  }) : s.length > 3 && (l = function(d, u, g) {
    return s.call(this, d, u, g, t);
  }));
  const f = r[e](l, ...n);
  return o ? Vt(t, f) : f;
}
function Ns(t, e, s) {
  const n = /* @__PURE__ */ G(t);
  gt(n, "iterate", Be);
  const r = n[e](...s);
  return (r === -1 || r === !1) && /* @__PURE__ */ xn(s[0]) ? (s[0] = /* @__PURE__ */ G(s[0]), n[e](...s)) : r;
}
function Pe(t, e, s = []) {
  $t(), dn();
  const n = (/* @__PURE__ */ G(t))[e].apply(t, s);
  return hn(), jt(), n;
}
const el = /* @__PURE__ */ Se("__proto__,__v_isRef,__isVue"), Pr = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((t) => t !== "arguments" && t !== "caller").map((t) => Symbol[t]).filter(se)
);
function sl(t) {
  se(t) || (t = String(t));
  const e = /* @__PURE__ */ G(this);
  return gt(e, "has", t), e.hasOwnProperty(t);
}
class Mr {
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
      return n === (r ? i ? dl : Hr : i ? Dr : Rr).get(e) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0;
    const l = j(e);
    if (!r) {
      let f;
      if (l && (f = Qi[s]))
        return f;
      if (s === "hasOwnProperty")
        return sl;
    }
    const o = Reflect.get(
      e,
      s,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ ht(e) ? e : n
    );
    if ((se(s) ? Pr.has(s) : el(s)) || (r || gt(e, "get", s), i))
      return o;
    if (/* @__PURE__ */ ht(o)) {
      const f = l && un(s) ? o : o.value;
      return r && nt(f) ? /* @__PURE__ */ Xs(f) : f;
    }
    return nt(o) ? r ? /* @__PURE__ */ Xs(o) : /* @__PURE__ */ bn(o) : o;
  }
}
class Ir extends Mr {
  constructor(e = !1) {
    super(!1, e);
  }
  set(e, s, n, r) {
    let i = e[s];
    const l = j(e) && un(s);
    if (!this._isShallow) {
      const d = /* @__PURE__ */ ne(i);
      if (!/* @__PURE__ */ It(n) && !/* @__PURE__ */ ne(n) && (i = /* @__PURE__ */ G(i), n = /* @__PURE__ */ G(n)), !l && /* @__PURE__ */ ht(i) && !/* @__PURE__ */ ht(n))
        return d || (i.value = n), !0;
    }
    const o = l ? Number(s) < e.length : J(e, s), f = Reflect.set(
      e,
      s,
      n,
      /* @__PURE__ */ ht(e) ? e : r
    );
    return e === /* @__PURE__ */ G(r) && f && (o ? Nt(n, i) && Wt(e, "set", s, n) : Wt(e, "add", s, n)), f;
  }
  deleteProperty(e, s) {
    const n = J(e, s);
    e[s];
    const r = Reflect.deleteProperty(e, s);
    return r && n && Wt(e, "delete", s, void 0), r;
  }
  has(e, s) {
    const n = Reflect.has(e, s);
    return (!se(s) || !Pr.has(s)) && gt(e, "has", s), n;
  }
  ownKeys(e) {
    return gt(
      e,
      "iterate",
      j(e) ? "length" : de
    ), Reflect.ownKeys(e);
  }
}
class nl extends Mr {
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
const rl = /* @__PURE__ */ new Ir(), il = /* @__PURE__ */ new nl(), ll = /* @__PURE__ */ new Ir(!0);
const Js = (t) => t, ts = (t) => Reflect.getPrototypeOf(t);
function ol(t, e, s) {
  return function(...n) {
    const r = this.__v_raw, i = /* @__PURE__ */ G(r), l = fe(i), o = t === "entries" || t === Symbol.iterator && l, f = t === "keys" && l, d = r[t](...n), u = s ? Js : e ? We : zt;
    return !e && gt(
      i,
      "iterate",
      f ? Gs : de
    ), pt(
      // inheriting all iterator properties
      Object.create(d),
      {
        // iterator protocol
        next() {
          const { value: g, done: T } = d.next();
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
function cl(t, e) {
  const s = {
    get(r) {
      const i = this.__v_raw, l = /* @__PURE__ */ G(i), o = /* @__PURE__ */ G(r);
      t || (Nt(r, o) && gt(l, "get", r), gt(l, "get", o));
      const { has: f } = ts(l), d = e ? Js : t ? We : zt;
      if (f.call(l, r))
        return d(i.get(r));
      if (f.call(l, o))
        return d(i.get(o));
      i !== l && i.get(r);
    },
    get size() {
      const r = this.__v_raw;
      return !t && gt(/* @__PURE__ */ G(r), "iterate", de), r.size;
    },
    has(r) {
      const i = this.__v_raw, l = /* @__PURE__ */ G(i), o = /* @__PURE__ */ G(r);
      return t || (Nt(r, o) && gt(l, "has", r), gt(l, "has", o)), r === o ? i.has(r) : i.has(r) || i.has(o);
    },
    forEach(r, i) {
      const l = this, o = l.__v_raw, f = /* @__PURE__ */ G(o), d = e ? Js : t ? We : zt;
      return !t && gt(f, "iterate", de), o.forEach((u, g) => r.call(i, d(u), d(g), l));
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
        const i = /* @__PURE__ */ G(this), l = ts(i), o = /* @__PURE__ */ G(r), f = !e && !/* @__PURE__ */ It(r) && !/* @__PURE__ */ ne(r) ? o : r;
        return l.has.call(i, f) || Nt(r, f) && l.has.call(i, r) || Nt(o, f) && l.has.call(i, o) || (i.add(f), Wt(i, "add", f, f)), this;
      },
      set(r, i) {
        !e && !/* @__PURE__ */ It(i) && !/* @__PURE__ */ ne(i) && (i = /* @__PURE__ */ G(i));
        const l = /* @__PURE__ */ G(this), { has: o, get: f } = ts(l);
        let d = o.call(l, r);
        d || (r = /* @__PURE__ */ G(r), d = o.call(l, r));
        const u = f.call(l, r);
        return l.set(r, i), d ? Nt(i, u) && Wt(l, "set", r, i) : Wt(l, "add", r, i), this;
      },
      delete(r) {
        const i = /* @__PURE__ */ G(this), { has: l, get: o } = ts(i);
        let f = l.call(i, r);
        f || (r = /* @__PURE__ */ G(r), f = l.call(i, r)), o && o.call(i, r);
        const d = i.delete(r);
        return f && Wt(i, "delete", r, void 0), d;
      },
      clear() {
        const r = /* @__PURE__ */ G(this), i = r.size !== 0, l = r.clear();
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
    s[r] = ol(r, t, e);
  }), s;
}
function mn(t, e) {
  const s = cl(t, e);
  return (n, r, i) => r === "__v_isReactive" ? !t : r === "__v_isReadonly" ? t : r === "__v_raw" ? n : Reflect.get(
    J(s, r) && r in n ? s : n,
    r,
    i
  );
}
const fl = {
  get: /* @__PURE__ */ mn(!1, !1)
}, al = {
  get: /* @__PURE__ */ mn(!1, !0)
}, ul = {
  get: /* @__PURE__ */ mn(!0, !1)
};
const Rr = /* @__PURE__ */ new WeakMap(), Dr = /* @__PURE__ */ new WeakMap(), Hr = /* @__PURE__ */ new WeakMap(), dl = /* @__PURE__ */ new WeakMap();
function hl(t) {
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
function bn(t) {
  return /* @__PURE__ */ ne(t) ? t : yn(
    t,
    !1,
    rl,
    fl,
    Rr
  );
}
// @__NO_SIDE_EFFECTS__
function pl(t) {
  return yn(
    t,
    !1,
    ll,
    al,
    Dr
  );
}
// @__NO_SIDE_EFFECTS__
function Xs(t) {
  return yn(
    t,
    !0,
    il,
    ul,
    Hr
  );
}
function yn(t, e, s, n, r) {
  if (!nt(t) || t.__v_raw && !(e && t.__v_isReactive) || t.__v_skip || !Object.isExtensible(t))
    return t;
  const i = r.get(t);
  if (i)
    return i;
  const l = hl(Ri(t));
  if (l === 0)
    return t;
  const o = new Proxy(
    t,
    l === 2 ? n : s
  );
  return r.set(t, o), o;
}
// @__NO_SIDE_EFFECTS__
function he(t) {
  return /* @__PURE__ */ ne(t) ? /* @__PURE__ */ he(t.__v_raw) : !!(t && t.__v_isReactive);
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
function xn(t) {
  return t ? !!t.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function G(t) {
  const e = t && t.__v_raw;
  return e ? /* @__PURE__ */ G(e) : t;
}
function gl(t) {
  return !J(t, "__v_skip") && Object.isExtensible(t) && Ee(t, "__v_skip", !0), t;
}
const zt = (t) => nt(t) ? /* @__PURE__ */ bn(t) : t, We = (t) => nt(t) ? /* @__PURE__ */ Xs(t) : t;
// @__NO_SIDE_EFFECTS__
function ht(t) {
  return t ? t.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function Zs(t) {
  return _l(t, !1);
}
function _l(t, e) {
  return /* @__PURE__ */ ht(t) ? t : new ml(t, e);
}
class ml {
  constructor(e, s) {
    this.dep = new gn(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = s ? e : /* @__PURE__ */ G(e), this._value = s ? e : zt(e), this.__v_isShallow = s;
  }
  get value() {
    return this.dep.track(), this._value;
  }
  set value(e) {
    const s = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ It(e) || /* @__PURE__ */ ne(e);
    e = n ? e : /* @__PURE__ */ G(e), Nt(e, s) && (this._rawValue = e, this._value = n ? e : zt(e), this.dep.trigger());
  }
}
function bl(t) {
  return /* @__PURE__ */ ht(t) ? t.value : t;
}
const yl = {
  get: (t, e, s) => e === "__v_raw" ? t : bl(Reflect.get(t, e, s)),
  set: (t, e, s, n) => {
    const r = t[e];
    return /* @__PURE__ */ ht(r) && !/* @__PURE__ */ ht(s) ? (r.value = s, !0) : Reflect.set(t, e, s, n);
  }
};
function Lr(t) {
  return /* @__PURE__ */ he(t) ? t : new Proxy(t, yl);
}
class xl {
  constructor(e, s, n) {
    this.fn = e, this.setter = s, this._value = void 0, this.dep = new gn(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = Ke - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !s, this.isSSR = n;
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags |= 16, !(this.flags & 8) && // avoid infinite self recursion
    tt !== this)
      return Er(this, !0), !0;
  }
  get value() {
    const e = this.dep.track();
    return Ar(this), e && (e.version = this.dep.version), this._value;
  }
  set value(e) {
    this.setter && this.setter(e);
  }
}
// @__NO_SIDE_EFFECTS__
function vl(t, e, s = !1) {
  let n, r;
  return $(t) ? n = t : (n = t.get, r = t.set), new xl(n, r, s);
}
const ss = {}, cs = /* @__PURE__ */ new WeakMap();
let oe;
function Tl(t, e = !1, s = oe) {
  if (s) {
    let n = cs.get(s);
    n || cs.set(s, n = []), n.push(t);
  }
}
function El(t, e, s = et) {
  const { immediate: n, deep: r, once: i, scheduler: l, augmentJob: o, call: f } = s, d = (_) => r ? _ : /* @__PURE__ */ It(_) || r === !1 || r === 0 ? te(_, 1) : te(_);
  let u, g, T, A, V = !1, M = !1;
  if (/* @__PURE__ */ ht(t) ? (g = () => t.value, V = /* @__PURE__ */ It(t)) : /* @__PURE__ */ he(t) ? (g = () => d(t), V = !0) : j(t) ? (M = !0, V = t.some((_) => /* @__PURE__ */ he(_) || /* @__PURE__ */ It(_)), g = () => t.map((_) => {
    if (/* @__PURE__ */ ht(_))
      return _.value;
    if (/* @__PURE__ */ he(_))
      return d(_);
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
    const _ = g, C = r === !0 ? 1 / 0 : r;
    g = () => te(_(), C);
  }
  const K = Ji(), W = () => {
    u.stop(), K && K.active && an(K.effects, u);
  };
  if (i && e) {
    const _ = e;
    e = (...C) => {
      const B = _(...C);
      return W(), B;
    };
  }
  let R = M ? new Array(t.length).fill(ss) : ss;
  const h = (_) => {
    if (!(!(u.flags & 1) || !u.dirty && !_))
      if (e) {
        const C = u.run();
        if (_ || r || V || (M ? C.some((B, P) => Nt(B, R[P])) : Nt(C, R))) {
          T && T();
          const B = oe;
          oe = u;
          try {
            const P = [
              C,
              // pass undefined as the old value when it's changed for the first time
              R === ss ? void 0 : M && R[0] === ss ? [] : R,
              A
            ];
            R = C, f ? f(e, 3, P) : (
              // @ts-expect-error
              e(...P)
            );
          } finally {
            oe = B;
          }
        }
      } else
        u.run();
  };
  return o && o(h), u = new vr(g), u.scheduler = l ? () => l(h, !1) : h, A = (_) => Tl(_, !1, u), T = u.onStop = () => {
    const _ = cs.get(u);
    if (_) {
      if (f)
        f(_, 4);
      else
        for (const C of _) C();
      cs.delete(u);
    }
  }, e ? n ? h(!0) : R = u.run() : l ? l(h.bind(null, !0), !0) : u.run(), W.pause = u.pause.bind(u), W.resume = u.resume.bind(u), W.stop = W, W;
}
function te(t, e = 1 / 0, s) {
  if (e <= 0 || !nt(t) || t.__v_skip || (s = s || /* @__PURE__ */ new Map(), (s.get(t) || 0) >= e))
    return t;
  if (s.set(t, e), e--, /* @__PURE__ */ ht(t))
    te(t.value, e, s);
  else if (j(t))
    for (let n = 0; n < t.length; n++)
      te(t[n], e, s);
  else if (Ys(t) || fe(t))
    t.forEach((n) => {
      te(n, e, s);
    });
  else if (Di(t)) {
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
  const s = Fe.length ? Fe[Fe.length - 1].component : null, n = s && s.appContext.config.warnHandler, r = wl();
  if (n)
    Ae(
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
          ({ vnode: i }) => `at <${Ei(s, i.type)}>`
        ).join(`
`),
        r
      ]
    );
  else {
    const i = [`[Vue warn]: ${t}`, ...e];
    r.length && i.push(`
`, ...Sl(r)), console.warn(...i);
  }
  jt(), Us = !1;
}
function wl() {
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
function Sl(t) {
  const e = [];
  return t.forEach((s, n) => {
    e.push(...n === 0 ? [] : [`
`], ...Al(s));
  }), e;
}
function Al({ vnode: t, recurseCount: e }) {
  const s = e > 0 ? `... (${e} recursive calls)` : "", n = t.component ? t.component.parent == null : !1, r = ` at <${Ei(
    t.component,
    t.type,
    n
  )}`, i = ">" + s;
  return t.props ? [r, ...Ol(t.props), i] : [r + i];
}
function Ol(t) {
  const e = [], s = Object.keys(t);
  return s.slice(0, 3).forEach((n) => {
    e.push(...Vr(n, t[n]));
  }), s.length > 3 && e.push(" ..."), e;
}
function Vr(t, e, s) {
  return st(e) ? (e = JSON.stringify(e), s ? e : [`${t}=${e}`]) : typeof e == "number" || typeof e == "boolean" || e == null ? s ? e : [`${t}=${e}`] : /* @__PURE__ */ ht(e) ? (e = Vr(t, /* @__PURE__ */ G(e.value), !0), s ? e : [`${t}=Ref<`, e, ">"]) : $(e) ? [`${t}=fn${e.name ? `<${e.name}>` : ""}`] : (e = /* @__PURE__ */ G(e), s ? e : [`${t}=`, e]);
}
function Ae(t, e, s, n) {
  try {
    return n ? t(...n) : t();
  } catch (r) {
    Ss(r, e, s);
  }
}
function Rt(t, e, s, n) {
  if ($(t)) {
    const r = Ae(t, e, s, n);
    return r && mr(r) && r.catch((i) => {
      Ss(i, e, s);
    }), r;
  }
  if (j(t)) {
    const r = [];
    for (let i = 0; i < t.length; i++)
      r.push(Rt(t[i], e, s, n));
    return r;
  }
}
function Ss(t, e, s, n = !0) {
  const r = e ? e.vnode : null, { errorHandler: i, throwUnhandledErrorInProduction: l } = e && e.appContext.config || et;
  if (e) {
    let o = e.parent;
    const f = e.proxy, d = `https://vuejs.org/error-reference/#runtime-${s}`;
    for (; o; ) {
      const u = o.ec;
      if (u) {
        for (let g = 0; g < u.length; g++)
          if (u[g](t, f, d) === !1)
            return;
      }
      o = o.parent;
    }
    if (i) {
      $t(), Ae(i, null, 10, [
        t,
        f,
        d
      ]), jt();
      return;
    }
  }
  Cl(t, s, r, n, l);
}
function Cl(t, e, s, n = !0, r = !1) {
  if (r)
    throw t;
  console.error(t);
}
const bt = [];
let Ht = -1;
const me = [];
let Qt = null, _e = 0;
const Nr = /* @__PURE__ */ Promise.resolve();
let fs = null;
function Pl(t) {
  const e = fs || Nr;
  return t ? e.then(this ? t.bind(this) : t) : e;
}
function Ml(t) {
  let e = Ht + 1, s = bt.length;
  for (; e < s; ) {
    const n = e + s >>> 1, r = bt[n], i = Ye(r);
    i < t || i === t && r.flags & 2 ? e = n + 1 : s = n;
  }
  return e;
}
function vn(t) {
  if (!(t.flags & 1)) {
    const e = Ye(t), s = bt[bt.length - 1];
    !s || // fast path when the job id is larger than the tail
    !(t.flags & 2) && e >= Ye(s) ? bt.push(t) : bt.splice(Ml(e), 0, t), t.flags |= 1, Ur();
  }
}
function Ur() {
  fs || (fs = Nr.then(Fr));
}
function Il(t) {
  if (!j(t))
    Qt && t.id === -1 ? Qt.splice(_e + 1, 0, t) : t.flags & 1 || (me.push(t), t.flags |= 1);
  else
    for (let e = 0; e < t.length; e++)
      me.push(t[e]);
  Ur();
}
function jn(t, e, s = Ht + 1) {
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
function Fr(t) {
  try {
    for (Ht = 0; Ht < bt.length; Ht++) {
      const e = bt[Ht];
      e && !(e.flags & 8) && (e.flags & 4 && (e.flags &= -2), Ae(
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
    Ht = -1, bt.length = 0, as(), fs = null, (bt.length || me.length) && Fr();
  }
}
let Ut, Re = [], Qs = !1;
function As(t, ...e) {
  Ut ? Ut.emit(t, ...e) : Qs || Re.push({ event: t, args: e });
}
function $r(t, e) {
  var s, n;
  Ut = t, Ut ? (Ut.enabled = !0, Re.forEach(({ event: r, args: i }) => Ut.emit(r, ...i)), Re = []) : /* handle late devtools injection - only do this if we are in an actual */ /* browser environment to avoid the timer handle stalling test runner exit */ /* (#4815) */ typeof window < "u" && // some envs mock window but not fully
  window.HTMLElement && // also exclude jsdom
  // eslint-disable-next-line no-restricted-syntax
  !((n = (s = window.navigator) == null ? void 0 : s.userAgent) != null && n.includes("jsdom")) ? ((e.__VUE_DEVTOOLS_HOOK_REPLAY__ = e.__VUE_DEVTOOLS_HOOK_REPLAY__ || []).push((i) => {
    $r(i, e);
  }), setTimeout(() => {
    Ut || (e.__VUE_DEVTOOLS_HOOK_REPLAY__ = null, Qs = !0, Re = []);
  }, 3e3)) : (Qs = !0, Re = []);
}
function Rl(t, e) {
  As("app:init", t, e, {
    Fragment: St,
    Text: ee,
    Comment: Gt,
    Static: ve
  });
}
function Dl(t) {
  As("app:unmount", t);
}
const Hl = /* @__PURE__ */ Tn(
  "component:added"
  /* COMPONENT_ADDED */
), jr = /* @__PURE__ */ Tn(
  "component:updated"
  /* COMPONENT_UPDATED */
), Ll = /* @__PURE__ */ Tn(
  "component:removed"
  /* COMPONENT_REMOVED */
), Vl = (t) => {
  Ut && typeof Ut.cleanupBuffer == "function" && // remove the component if it wasn't buffered
  !Ut.cleanupBuffer(t) && Ll(t);
};
// @__NO_SIDE_EFFECTS__
function Tn(t) {
  return (e) => {
    As(
      t,
      e.appContext.app,
      e.uid,
      e.parent ? e.parent.uid : void 0,
      e
    );
  };
}
function Nl(t, e, s) {
  As(
    "component:emit",
    t.appContext.app,
    t,
    e,
    s
  );
}
let Ft = null, kr = null;
function us(t) {
  const e = Ft;
  return Ft = t, kr = t && t.type.__scopeId || null, e;
}
function Ul(t, e = Ft, s) {
  if (!e || t._n)
    return t;
  const n = (...r) => {
    n._d && gs(-1);
    const i = us(e), l = Te.length;
    let o;
    try {
      o = t(...r);
    } finally {
      for (let f = Te.length; f > l; f--) Ko();
      us(i), n._d && gs(1);
    }
    return __VUE_PROD_DEVTOOLS__ && jr(e), o;
  };
  return n._n = !0, n._c = !0, n._d = !0, n;
}
function Lt(t, e, s, n) {
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
function Fl(t, e) {
  if (yt) {
    let s = yt.provides;
    const n = yt.parent && yt.parent.provides;
    n === s && (s = yt.provides = Object.create(n)), s[t] = e;
  }
}
function ls(t, e, s = !1) {
  const n = Xo();
  if (n || xe) {
    let r = xe ? xe._context.provides : n ? n.parent == null || n.ce ? n.vnode.appContext && n.vnode.appContext.provides : n.parent.provides : void 0;
    if (r && t in r)
      return r[t];
    if (arguments.length > 1)
      return s && $(e) ? e.call(n && n.proxy) : e;
  }
}
const $l = /* @__PURE__ */ Symbol.for("v-scx"), jl = () => ls($l);
function Fs(t, e, s) {
  return Kr(t, e, s);
}
function Kr(t, e, s = et) {
  const { immediate: n, deep: r, flush: i, once: l } = s, o = pt({}, s), f = e && n || !e && i !== "post";
  let d;
  if (ze) {
    if (i === "sync") {
      const A = jl();
      d = A.__watcherHandles || (A.__watcherHandles = []);
    } else if (!f) {
      const A = () => {
      };
      return A.stop = Ct, A.resume = Ct, A.pause = Ct, A;
    }
  }
  const u = yt;
  o.call = (A, V, M) => Rt(A, u, V, M);
  let g = !1;
  i === "post" ? o.scheduler = (A) => {
    mt(A, u && u.suspense);
  } : i !== "sync" && (g = !0, o.scheduler = (A, V) => {
    V ? A() : vn(A);
  }), o.augmentJob = (A) => {
    e && (A.flags |= 4), g && (A.flags |= 2, u && (A.id = u.uid, A.i = u));
  };
  const T = El(t, e, o);
  return ze && (d ? d.push(T) : f && T()), T;
}
function kl(t, e, s) {
  const n = this.proxy, r = st(t) ? t.includes(".") ? Br(n, t) : () => n[t] : t.bind(n, n);
  let i;
  $(e) ? i = e : (i = e.handler, s = e);
  const l = Xe(this), o = Kr(r, i.bind(n), s);
  return l(), o;
}
function Br(t, e) {
  const s = e.split(".");
  return () => {
    let n = t;
    for (let r = 0; r < s.length && n; r++)
      n = n[s[r]];
    return n;
  };
}
const Zt = /* @__PURE__ */ new WeakMap(), Wr = /* @__PURE__ */ Symbol("_vte"), Os = (t) => t.__isTeleport, ce = (t) => t && (t.disabled || t.disabled === ""), Kl = (t) => t && (t.defer || t.defer === ""), kn = (t) => typeof SVGElement < "u" && t instanceof SVGElement, Kn = (t) => typeof MathMLElement == "function" && t instanceof MathMLElement, tn = (t, e) => {
  const s = t && t.to;
  return st(s) ? e ? e(s) : null : s;
}, Bl = {
  name: "Teleport",
  __isTeleport: !0,
  process(t, e, s, n, r, i, l, o, f, d) {
    const {
      mc: u,
      pc: g,
      pbc: T,
      o: { insert: A, querySelector: V, createText: M, createComment: K, parentNode: W }
    } = d, R = ce(e.props);
    let { dynamicChildren: h } = e;
    const _ = (P, F, N) => {
      P.shapeFlag & 16 && u(
        P.children,
        F,
        N,
        r,
        i,
        l,
        o,
        f
      );
    }, C = (P = e) => {
      const F = ce(P.props), N = P.target = tn(P.props, V), Y = en(N, P, M, A);
      N && (l !== "svg" && kn(N) ? l = "svg" : l !== "mathml" && Kn(N) && (l = "mathml"), r && r.isCE && (r.ce._teleportTargets || (r.ce._teleportTargets = /* @__PURE__ */ new Set())).add(N), F || (_(P, N, Y), De(P, !1)));
    }, B = (P) => {
      const F = () => {
        if (Zt.get(P) === F) {
          if (Zt.delete(P), ce(P.props)) {
            const N = W(P.el) || s;
            _(P, N, P.anchor), De(P, !0);
          }
          C(P);
        }
      };
      Zt.set(P, F), mt(F, i);
    };
    if (t == null) {
      const P = e.el = M(""), F = e.anchor = M("");
      if (A(P, s, n), A(F, s, n), Kl(e.props) || i && i.pendingBranch) {
        B(e);
        return;
      }
      R && (_(e, s, F), De(e, !0)), C();
    } else {
      e.el = t.el;
      const P = e.anchor = t.anchor, F = Zt.get(t);
      if (F) {
        F.flags |= 8, Zt.delete(t), B(e);
        return;
      }
      e.targetStart = t.targetStart;
      const N = e.target = t.target, Y = e.targetAnchor = t.targetAnchor, U = ce(t.props), ot = U ? s : N, lt = U ? P : Y;
      if (l === "svg" || kn(N) ? l = "svg" : (l === "mathml" || Kn(N)) && (l = "mathml"), h ? (T(
        t.dynamicChildren,
        h,
        ot,
        r,
        i,
        l,
        o
      ), Cn(t, e, !0)) : f || g(
        t,
        e,
        ot,
        lt,
        r,
        i,
        l,
        o,
        !1
      ), R)
        U ? e.props && t.props && e.props.to !== t.props.to && (e.props.to = t.props.to) : ns(
          e,
          s,
          P,
          d,
          1
        );
      else if ((e.props && e.props.to) !== (t.props && t.props.to)) {
        const rt = tn(e.props, V);
        rt && (e.target = rt, ns(
          e,
          rt,
          null,
          d,
          0
        ));
      } else U && ns(
        e,
        N,
        Y,
        d,
        1
      );
      De(e, R);
    }
  },
  remove(t, e, s, { um: n, o: { remove: r } }, i) {
    const {
      shapeFlag: l,
      children: o,
      anchor: f,
      targetStart: d,
      targetAnchor: u,
      target: g,
      props: T
    } = t, A = ce(T), V = i || !A, M = Zt.get(t);
    if (M && (M.flags |= 8, Zt.delete(t)), g && (r(d), r(u)), i && r(f), !M && (A || g) && l & 16)
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
  hydrate: Wl
};
function ns(t, e, s, { o: { insert: n }, m: r }, i = 2) {
  i === 0 && n(t.targetAnchor, e, s);
  const { el: l, anchor: o, shapeFlag: f, children: d, props: u } = t, g = i === 2;
  if (g && n(l, e, s), !Zt.has(t) && (!g || ce(u)) && f & 16)
    for (let T = 0; T < d.length; T++)
      r(
        d[T],
        e,
        s,
        2
      );
  g && n(o, e, s);
}
function Wl(t, e, s, n, r, i, {
  o: { nextSibling: l, parentNode: o, querySelector: f, insert: d, createText: u }
}, g) {
  function T(K, W) {
    let R = W;
    for (; R; ) {
      if (R && R.nodeType === 8) {
        if (R.data === "teleport start anchor")
          e.targetStart = R;
        else if (R.data === "teleport anchor") {
          e.targetAnchor = R, K._lpa = e.targetAnchor && l(e.targetAnchor);
          break;
        }
      }
      R = l(R);
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
  const V = e.target = tn(
    e.props,
    f
  ), M = ce(e.props);
  if (V) {
    const K = V._lpa || V.firstChild;
    e.shapeFlag & 16 && (M ? (A(t, e), T(V, K), e.targetAnchor || en(
      V,
      e,
      u,
      d,
      // if target is the same as the main view, insert anchors before current node
      // to avoid hydrating mismatch
      o(t) === V ? t : null
    )) : (e.anchor = l(t), T(V, K), e.targetAnchor || en(V, e, u, d), g(
      K && l(K),
      e,
      V,
      s,
      n,
      r,
      i
    ))), De(e, M);
  } else M && e.shapeFlag & 16 && (A(t, e), e.targetStart = t, e.targetAnchor = l(t));
  return e.anchor && l(e.anchor);
}
const Yl = Bl;
function De(t, e) {
  const s = t.ctx;
  if (s && s.ut) {
    let n, r;
    for (e ? (n = t.el, r = t.anchor) : (n = t.targetStart, r = t.targetAnchor); n && n !== r; )
      n.nodeType === 1 && n.setAttribute("data-v-owner", s.uid), n = n.nextSibling;
    s.ut();
  }
}
function en(t, e, s, n, r = null) {
  const i = e.targetStart = s(""), l = e.targetAnchor = s("");
  return i[Wr] = l, t && (n(i, t, r), n(l, t, r)), l;
}
const $s = /* @__PURE__ */ Symbol("_leaveCb");
function ql(t) {
  let e = t[0];
  if (t.length > 1) {
    for (const s of t)
      if (s.type !== Gt) {
        e = s;
        break;
      }
  }
  return e;
}
function Yr(t) {
  if (!Sn(t))
    return Os(t.type) && t.children ? ql(t.children) : t;
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
function En(t, e) {
  if (t.shapeFlag & 6 && t.component) {
    t.transition = e;
    const s = t.component.subTree;
    En(
      Os(s.type) && Yr(s) || s,
      e
    );
  } else t.shapeFlag & 128 ? (t.ssContent.transition = e.clone(t.ssContent), t.ssFallback.transition = e.clone(t.ssFallback)) : t.transition = e;
}
// @__NO_SIDE_EFFECTS__
function zl(t, e) {
  return $(t) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    pt({ name: t.name }, e, { setup: t })
  ) : t;
}
function qr(t) {
  t.ids = [t.ids[0] + t.ids[2]++ + "-", 0, 0];
}
function Bn(t, e) {
  let s;
  return !!((s = Object.getOwnPropertyDescriptor(t, e)) && !s.configurable);
}
const ds = /* @__PURE__ */ new WeakMap();
function be(t, e, s, n, r = !1) {
  if (j(t)) {
    t.forEach(
      (M, K) => be(
        M,
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
  const i = n.shapeFlag & 4 ? Mn(n.component) : n.el, l = r ? null : i, { i: o, r: f } = t, d = e && e.r, u = o.refs === et ? o.refs = {} : o.refs, g = o.setupState, T = /* @__PURE__ */ G(g), A = g === et ? _r : (M) => Bn(u, M) ? !1 : J(T, M), V = (M, K) => !(K && Bn(u, K));
  if (d != null && d !== f) {
    if (Wn(e), st(d))
      u[d] = null, A(d) && (g[d] = null);
    else if (/* @__PURE__ */ ht(d)) {
      const M = e;
      V(d, M.k) && (d.value = null), M.k && (u[M.k] = null);
    }
  }
  if ($(f))
    Ae(f, o, 12, [l, u]);
  else {
    const M = st(f), K = /* @__PURE__ */ ht(f);
    if (M || K) {
      const W = () => {
        if (t.f) {
          const R = M ? A(f) ? g[f] : u[f] : V() || !t.k ? f.value : u[t.k];
          if (r)
            j(R) && an(R, i);
          else if (j(R))
            R.includes(i) || R.push(i);
          else if (M)
            u[f] = [i], A(f) && (g[f] = u[f]);
          else {
            const h = [i];
            V(f, t.k) && (f.value = h), t.k && (u[t.k] = h);
          }
        } else M ? (u[f] = l, A(f) && (g[f] = l)) : K && (V(f, t.k) && (f.value = l), t.k && (u[t.k] = l));
      };
      if (l) {
        const R = () => {
          W(), ds.delete(t);
        };
        R.id = -1, ds.set(t, R), mt(R, s);
      } else
        Wn(t), W();
    }
  }
}
function Wn(t) {
  const e = ds.get(t);
  e && (e.flags |= 8, ds.delete(t));
}
let Yn = !1;
const ie = () => {
  Yn || (console.error("Hydration completed but contains mismatches."), Yn = !0);
}, Gl = (t) => t.namespaceURI.includes("svg") && t.tagName !== "foreignObject", Jl = (t) => t.namespaceURI.includes("MathML"), rs = (t) => {
  if (t.nodeType === 1) {
    if (Gl(t)) return "svg";
    if (Jl(t)) return "mathml";
  }
}, Me = (t) => t.nodeType === 8;
function Xl(t) {
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
      createComment: d
    }
  } = t, u = (h, _) => {
    if (!_.hasChildNodes()) {
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
        "Attempting to hydrate existing markup but container is empty. Performing full mount instead."
      ), s(null, h, _), as(), _._vnode = h;
      return;
    }
    g(_.firstChild, h, null, null, null), as(), _._vnode = h;
  }, g = (h, _, C, B, P, F = !1) => {
    F = F || !!_.dynamicChildren;
    const N = Me(h) && h.data === "[", Y = () => M(
      h,
      _,
      C,
      B,
      P,
      N
    ), { type: U, ref: ot, shapeFlag: lt, patchFlag: rt } = _;
    let ut = h.nodeType;
    _.el = h, __VUE_PROD_DEVTOOLS__ && (Ee(h, "__vnode", _, !0), Ee(h, "__vueParentComponent", C, !0)), rt === -2 && (F = !1, _.dynamicChildren = null);
    let H = null;
    switch (U) {
      case ee:
        ut !== 3 ? _.children === "" ? (f(_.el = r(""), l(h), h), H = h) : H = Y() : (h.data !== _.children && (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
          "Hydration text mismatch in",
          h.parentNode,
          `
  - rendered on server: ${JSON.stringify(
            h.data
          )}
  - expected on client: ${JSON.stringify(_.children)}`
        ), ie(), h.data = _.children), H = i(h));
        break;
      case Gt:
        R(h) ? (H = i(h), W(
          _.el = h.content.firstChild,
          h,
          C
        )) : ut !== 8 || N ? H = Y() : H = i(h);
        break;
      case ve:
        if (N && (h = i(h), ut = h.nodeType), ut === 1 || ut === 3) {
          H = h;
          const z = !_.children.length;
          for (let k = 0; k < _.staticCount; k++)
            z && (_.children += H.nodeType === 1 ? H.outerHTML : H.data), k === _.staticCount - 1 && (_.anchor = H), H = i(H);
          return N ? i(H) : H;
        } else
          Y();
        break;
      case St:
        N ? H = V(
          h,
          _,
          C,
          B,
          P,
          F
        ) : H = Y();
        break;
      default:
        if (lt & 1)
          (ut !== 1 || _.type.toLowerCase() !== h.tagName.toLowerCase()) && !R(h) ? H = Y() : H = T(
            h,
            _,
            C,
            B,
            P,
            F
          );
        else if (lt & 6) {
          _.slotScopeIds = P;
          const z = l(h);
          if (N ? H = K(h) : Me(h) && h.data === "teleport start" ? H = K(h, h.data, "teleport end") : H = i(h), e(
            _,
            z,
            null,
            C,
            B,
            rs(z),
            F
          ), ye(_) && !_.component.subTree) {
            let k;
            N ? (k = Et(ve), k.anchor = H ? H.previousSibling : z.lastChild) : k = h.nodeType === 3 ? xi("") : Et("div"), k.el = h, _.component.subTree = k;
          }
        } else lt & 64 ? ut !== 8 ? H = Y() : H = _.type.hydrate(
          h,
          _,
          C,
          B,
          P,
          F,
          t,
          A
        ) : lt & 128 ? H = _.type.hydrate(
          h,
          _,
          C,
          B,
          rs(l(h)),
          P,
          F,
          t,
          g
        ) : __VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt("Invalid HostVNode type:", U, `(${typeof U})`);
    }
    return ot != null && be(ot, null, B, _), H;
  }, T = (h, _, C, B, P, F) => {
    F = F || !!_.dynamicChildren;
    const {
      type: N,
      dynamicProps: Y,
      props: U,
      patchFlag: ot,
      shapeFlag: lt,
      dirs: rt,
      transition: ut
    } = _, H = N === "input" || N === "option", z = !!Y;
    if (H || z || ot !== -1) {
      rt && Lt(_, null, C, "created");
      let k = !1;
      if (R(h)) {
        k = pi(
          null,
          // no need check parentSuspense in hydration
          ut
        ) && C && C.vnode.props && C.vnode.props.appear;
        const Z = h.content.firstChild;
        if (k) {
          const at = Z.getAttribute("class");
          at && (Z.$cls = at), ut.beforeEnter(Z);
        }
        W(Z, h, C), _.el = h = Z;
      }
      if (lt & 16 && // skip if element has innerHTML / textContent
      !(U && (U.innerHTML || U.textContent))) {
        let Z = A(
          h.firstChild,
          _,
          h,
          C,
          B,
          P,
          F
        );
        for (Z && !$e(
          h,
          1
          /* CHILDREN */
        ) && (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
          "Hydration children mismatch on",
          h,
          `
Server rendered element contains more child nodes than client vdom.`
        ), ie()); Z; ) {
          const at = Z;
          Z = Z.nextSibling, o(at);
        }
      } else if (lt & 8) {
        let Z = _.children;
        Z[0] === `
` && (h.tagName === "PRE" || h.tagName === "TEXTAREA") && (Z = Z.slice(1));
        const { textContent: at } = h;
        at !== Z && // innerHTML normalize \r\n or \r into a single \n in the DOM
        at !== Z.replace(/\r\n|\r/g, `
`) && ($e(
          h,
          0
          /* TEXT */
        ) || (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
          "Hydration text content mismatch on",
          h,
          `
  - rendered on server: ${at}
  - expected on client: ${Z}`
        ), ie()), h.textContent = _.children);
      }
      if (U) {
        if (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ || H || z || !F || ot & 48) {
          const Z = h.tagName.includes("-"), at = h.namespaceURI.includes("svg") ? "svg" : h.namespaceURI.includes("MathML") ? "mathml" : void 0;
          for (const it in U)
            if (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && // #11189 skip if this node has directives that have created hooks
            // as it could have mutated the DOM in any possible way
            !(rt && rt.some((Ze) => Ze.dir.created)) && to(h, it, U[it], _, C) && ie(), H && (it.endsWith("value") || it === "indeterminate") || Ge(it) && !ae(it) || // force hydrate v-bind with .prop modifiers
            it[0] === "." || Z && !ae(it) || Y && Y.includes(it)) {
              if (Ql(h, it, U[it]))
                continue;
              n(h, it, null, U[it], at, C);
            }
        } else if (U.onClick)
          n(
            h,
            "onClick",
            null,
            U.onClick,
            void 0,
            C
          );
        else if (ot & 4 && /* @__PURE__ */ he(U.style))
          for (const Z in U.style) U.style[Z];
      }
      let xt;
      (xt = U && U.onVnodeBeforeMount) && wt(xt, C, _), rt && Lt(_, null, C, "beforeMount"), ((xt = U && U.onVnodeMounted) || rt || k) && bi(() => {
        xt && wt(xt, C, _), k && ut.enter(h), rt && Lt(_, null, C, "mounted");
      }, B);
    }
    return h.nextSibling;
  }, A = (h, _, C, B, P, F, N) => {
    N = N || !!_.dynamicChildren;
    const Y = _.children, U = Y.length;
    let ot = !1;
    for (let lt = 0; lt < U; lt++) {
      const rt = N ? Y[lt] : Y[lt] = At(Y[lt]), ut = rt.type === ee;
      h ? (ut && !N && lt + 1 < U && At(Y[lt + 1]).type === ee && (f(
        r(
          h.data.slice(rt.children.length)
        ),
        C,
        i(h)
      ), h.data = rt.children), h = g(
        h,
        rt,
        B,
        P,
        F,
        N
      )) : ut && !rt.children ? f(rt.el = r(""), C) : (ot || (ot = !0, $e(
        C,
        1
        /* CHILDREN */
      ) || (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
        "Hydration children mismatch on",
        C,
        `
Server rendered element contains fewer child nodes than client vdom.`
      ), ie())), s(
        null,
        rt,
        C,
        null,
        B,
        P,
        rs(C),
        F
      ));
    }
    return h;
  }, V = (h, _, C, B, P, F) => {
    const { slotScopeIds: N } = _;
    N && (P = P ? P.concat(N) : N);
    const Y = l(h), U = A(
      i(h),
      _,
      Y,
      C,
      B,
      P,
      F
    );
    return U && Me(U) && U.data === "]" ? i(_.anchor = U) : (ie(), f(_.anchor = d("]"), Y, U), U);
  }, M = (h, _, C, B, P, F) => {
    if (no(h, _) || (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ && Xt(
      `Hydration node mismatch:
- rendered on server:`,
      h,
      h.nodeType === 3 ? "(text)" : Me(h) && h.data === "[" ? "(start of fragment)" : "",
      `
- expected on client:`,
      _.type
    ), ie()), _.el = null, F) {
      const U = K(h);
      for (; ; ) {
        const ot = i(h);
        if (ot && ot !== U)
          o(ot);
        else
          break;
      }
    }
    const N = i(h), Y = l(h);
    return o(h), s(
      null,
      _,
      Y,
      N,
      C,
      B,
      rs(Y),
      P
    ), C && (C.vnode.el = _.el, ri(C, _.el)), N;
  }, K = (h, _ = "[", C = "]") => {
    let B = 0;
    for (; h; )
      if (h = i(h), h && Me(h) && (h.data === _ && B++, h.data === C)) {
        if (B === 0)
          return i(h);
        B--;
      }
    return h;
  }, W = (h, _, C) => {
    const B = _.parentNode;
    B && B.replaceChild(h, _);
    let P = C;
    for (; P; )
      P.vnode.el === _ && (P.vnode.el = P.subTree.el = h), P = P.parent;
  }, R = (h) => h.nodeType === 1 && h.tagName === "TEMPLATE";
  return [u, g];
}
const Zl = /* @__PURE__ */ new Set(["src", "srcset", "href", "poster"]);
function Ql(t, e, s) {
  return Zl.has(e) ? t.getAttribute(e) === (s == null ? null : `${s}`) : !1;
}
function to(t, e, s, n, r) {
  let i, l, o, f;
  if (e === "class")
    t.$cls ? (o = t.$cls, delete t.$cls) : o = t.getAttribute("class"), f = Ts(s), eo(zn(o || ""), zn(f)) || (i = 2, l = "class");
  else if (e === "style") {
    o = t.getAttribute("style") || "", f = st(s) ? s : ji(vs(s));
    const d = Gn(o), u = Gn(f);
    if (n.dirs)
      for (const { dir: g, value: T } of n.dirs)
        g.name === "show" && !T && u.set("display", "none");
    r && zr(r, n, u), so(d, u) || (i = 3, l = "style");
  } else (t instanceof SVGElement && Bi(e) || t instanceof HTMLElement && (Nn(e) || Ki(e))) && (e === "hidden" ? (o = qn(t.getAttribute(e)), f = qn(s)) : Nn(e) ? (o = t.hasAttribute(e), f = Es(s)) : s == null ? (o = t.hasAttribute(e), f = !1) : (t.hasAttribute(e) ? o = t.getAttribute(e) : e === "value" && t.tagName === "TEXTAREA" ? o = t.value : o = !1, f = xr(s) ? String(s) : !1), o !== f && (i = 4, l = e));
  if (i != null && !$e(t, i)) {
    const d = (T) => T === !1 ? "(not rendered)" : `${l}="${T}"`, u = `Hydration ${Gr[i]} mismatch on`, g = `
  - rendered on server: ${d(o)}
  - expected on client: ${d(f)}
  Note: this mismatch is check-only. The DOM will not be rectified in production due to performance overhead.
  You should fix the source of the mismatch.`;
    return Xt(u, t, g), !0;
  }
  return !1;
}
function qn(t) {
  return xr(t) ? st(t) ? t.toLowerCase() === "until-found" ? "until-found" : "" : Es(t) ? "" : !1 : !1;
}
function zn(t) {
  return new Set(t.trim().split(/\s+/));
}
function eo(t, e) {
  if (t.size !== e.size)
    return !1;
  for (const s of t)
    if (!e.has(s))
      return !1;
  return !0;
}
function Gn(t) {
  const e = /* @__PURE__ */ new Map();
  for (const s of t.split(";")) {
    let [n, r] = s.split(":");
    n = n.trim(), r = r && r.trim(), n && r && e.set(n, r);
  }
  return e;
}
function so(t, e) {
  if (t.size !== e.size)
    return !1;
  for (const [s, n] of t)
    if (n !== e.get(s))
      return !1;
  return !0;
}
function zr(t, e, s) {
  const n = t.subTree;
  if (t.getCssVars && (e === n || n && n.type === St && n.children.includes(e))) {
    const r = t.getCssVars();
    for (const i in r) {
      const l = zi(r[i]);
      s.set(`--${Yi(i)}`, l);
    }
  }
  e === n && t.parent && zr(t.parent, t.vnode, s);
}
const hs = "data-allow-mismatch", Gr = {
  0: "text",
  1: "children",
  2: "class",
  3: "style",
  4: "attribute"
};
function $e(t, e) {
  if (e === 0 || e === 1)
    for (; t && !t.hasAttribute(hs); )
      t = t.parentElement;
  return wn(
    t && t.getAttribute(hs),
    e
  );
}
function wn(t, e) {
  if (t == null)
    return !1;
  if (t === "")
    return !0;
  {
    const s = t.split(",");
    return e === 0 && s.includes("children") ? !0 : s.includes(Gr[e]);
  }
}
function no(t, e) {
  return $e(
    t.parentElement,
    1
    /* CHILDREN */
  ) || ro(t) || io(e);
}
function ro(t) {
  return t.nodeType === 1 && wn(
    t.getAttribute(hs),
    1
    /* CHILDREN */
  );
}
function io({ props: t }) {
  const e = t && t[hs];
  return typeof e == "string" && wn(
    e,
    1
    /* CHILDREN */
  );
}
ue().requestIdleCallback;
ue().cancelIdleCallback;
const ye = (t) => !!t.type.__asyncLoader, Sn = (t) => t.type.__isKeepAlive;
function lo(t, e) {
  Jr(t, "a", e);
}
function oo(t, e) {
  Jr(t, "da", e);
}
function Jr(t, e, s = yt) {
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
      Sn(r.parent.vnode) && co(n, e, s, r), r = r.parent;
  }
}
function co(t, e, s, n) {
  const r = Cs(
    e,
    t,
    n,
    !0
    /* prepend */
  );
  Zr(() => {
    an(n[e], r);
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
  (!ze || t === "sp") && Cs(t, (...n) => e(...n), s);
}, fo = Jt("bm"), ao = Jt("m"), uo = Jt(
  "bu"
), ho = Jt("u"), Xr = Jt(
  "bum"
), Zr = Jt("um"), po = Jt(
  "sp"
), go = Jt("rtg"), _o = Jt("rtc");
function mo(t, e = yt) {
  Cs("ec", t, e);
}
const bo = /* @__PURE__ */ Symbol.for("v-ndc"), sn = (t) => t ? vi(t) ? Mn(t) : sn(t.parent) : null, je = (
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
    $parent: (t) => sn(t.parent),
    $root: (t) => sn(t.root),
    $host: (t) => t.ce,
    $emit: (t) => t.emit,
    $options: (t) => __VUE_OPTIONS_API__ ? ti(t) : t.type,
    $forceUpdate: (t) => t.f || (t.f = () => {
      vn(t.update);
    }),
    $nextTick: (t) => t.n || (t.n = Pl.bind(t.proxy)),
    $watch: (t) => __VUE_OPTIONS_API__ ? kl.bind(t) : Ct
  })
), js = (t, e) => t !== et && !t.__isScriptSetup && J(t, e), yo = {
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
        (!__VUE_OPTIONS_API__ || nn) && (l[e] = 0);
      }
    }
    const d = je[e];
    let u, g;
    if (d)
      return e === "$attrs" && gt(t.attrs, "get", ""), d(t);
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
function Jn(t) {
  return j(t) ? t.reduce(
    (e, s) => (e[s] = null, e),
    {}
  ) : t;
}
let nn = !0;
function xo(t) {
  const e = ti(t), s = t.proxy, n = t.ctx;
  nn = !1, e.beforeCreate && Xn(e.beforeCreate, t, "bc");
  const {
    // state
    data: r,
    computed: i,
    methods: l,
    watch: o,
    provide: f,
    inject: d,
    // lifecycle
    created: u,
    beforeMount: g,
    mounted: T,
    beforeUpdate: A,
    updated: V,
    activated: M,
    deactivated: K,
    beforeDestroy: W,
    beforeUnmount: R,
    destroyed: h,
    unmounted: _,
    render: C,
    renderTracked: B,
    renderTriggered: P,
    errorCaptured: F,
    serverPrefetch: N,
    // public API
    expose: Y,
    inheritAttrs: U,
    // assets
    components: ot,
    directives: lt,
    filters: rt
  } = e;
  if (d && vo(d, n, null), l)
    for (const z in l) {
      const k = l[z];
      $(k) && (n[z] = k.bind(s));
    }
  if (r) {
    const z = r.call(s, s);
    nt(z) && (t.data = /* @__PURE__ */ bn(z));
  }
  if (nn = !0, i)
    for (const z in i) {
      const k = i[z], xt = $(k) ? k.bind(s, s) : $(k.get) ? k.get.bind(s, s) : Ct, Z = !$(k) && $(k.set) ? k.set.bind(s) : Ct, at = lc({
        get: xt,
        set: Z
      });
      Object.defineProperty(n, z, {
        enumerable: !0,
        configurable: !0,
        get: () => at.value,
        set: (it) => at.value = it
      });
    }
  if (o)
    for (const z in o)
      Qr(o[z], n, s, z);
  if (f) {
    const z = $(f) ? f.call(s) : f;
    Reflect.ownKeys(z).forEach((k) => {
      Fl(k, z[k]);
    });
  }
  u && Xn(u, t, "c");
  function H(z, k) {
    j(k) ? k.forEach((xt) => z(xt.bind(s))) : k && z(k.bind(s));
  }
  if (H(fo, g), H(ao, T), H(uo, A), H(ho, V), H(lo, M), H(oo, K), H(mo, F), H(_o, B), H(go, P), H(Xr, R), H(Zr, _), H(po, N), j(Y))
    if (Y.length) {
      const z = t.exposed || (t.exposed = {});
      Y.forEach((k) => {
        Object.defineProperty(z, k, {
          get: () => s[k],
          set: (xt) => s[k] = xt,
          enumerable: !0
        });
      });
    } else t.exposed || (t.exposed = {});
  C && t.render === Ct && (t.render = C), U != null && (t.inheritAttrs = U), ot && (t.components = ot), lt && (t.directives = lt), N && qr(t);
}
function vo(t, e, s = Ct) {
  j(t) && (t = rn(t));
  for (const n in t) {
    const r = t[n];
    let i;
    nt(r) ? "default" in r ? i = ls(
      r.from || n,
      r.default,
      !0
    ) : i = ls(r.from || n) : i = ls(r), /* @__PURE__ */ ht(i) ? Object.defineProperty(e, n, {
      enumerable: !0,
      configurable: !0,
      get: () => i.value,
      set: (l) => i.value = l
    }) : e[n] = i;
  }
}
function Xn(t, e, s) {
  Rt(
    j(t) ? t.map((n) => n.bind(e.proxy)) : t.bind(e.proxy),
    e,
    s
  );
}
function Qr(t, e, s, n) {
  let r = n.includes(".") ? Br(s, n) : () => s[n];
  if (st(t)) {
    const i = e[t];
    $(i) && Fs(r, i);
  } else if ($(t))
    Fs(r, t.bind(s));
  else if (nt(t))
    if (j(t))
      t.forEach((i) => Qr(i, e, s, n));
    else {
      const i = $(t.handler) ? t.handler.bind(s) : e[t.handler];
      $(i) && Fs(r, i, t);
    }
}
function ti(t) {
  const e = t.type, { mixins: s, extends: n } = e, {
    mixins: r,
    optionsCache: i,
    config: { optionMergeStrategies: l }
  } = t.appContext, o = i.get(e);
  let f;
  return o ? f = o : !r.length && !s && !n ? f = e : (f = {}, r.length && r.forEach(
    (d) => ps(f, d, l, !0)
  ), ps(f, e, l)), nt(e) && i.set(e, f), f;
}
function ps(t, e, s, n = !1) {
  const { mixins: r, extends: i } = e;
  i && ps(t, i, s, !0), r && r.forEach(
    (l) => ps(t, l, s, !0)
  );
  for (const l in e)
    if (!(n && l === "expose")) {
      const o = To[l] || s && s[l];
      t[l] = o ? o(t[l], e[l]) : e[l];
    }
  return t;
}
const To = {
  data: Zn,
  props: Qn,
  emits: Qn,
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
  watch: wo,
  // provide / inject
  provide: Zn,
  inject: Eo
};
function Zn(t, e) {
  return e ? t ? function() {
    return pt(
      $(t) ? t.call(this, this) : t,
      $(e) ? e.call(this, this) : e
    );
  } : e : t;
}
function Eo(t, e) {
  return He(rn(t), rn(e));
}
function rn(t) {
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
function Qn(t, e) {
  return t ? j(t) && j(e) ? [.../* @__PURE__ */ new Set([...t, ...e])] : pt(
    /* @__PURE__ */ Object.create(null),
    Jn(t),
    Jn(e ?? {})
  ) : e;
}
function wo(t, e) {
  if (!t) return e;
  if (!e) return t;
  const s = pt(/* @__PURE__ */ Object.create(null), t);
  for (const n in e)
    s[n] = _t(t[n], e[n]);
  return s;
}
function ei() {
  return {
    app: null,
    config: {
      isNativeTag: _r,
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
    const i = ei(), l = /* @__PURE__ */ new WeakSet(), o = [];
    let f = !1;
    const d = i.app = {
      _uid: So++,
      _component: n,
      _props: r,
      _container: null,
      _context: i,
      _instance: null,
      version: on,
      get config() {
        return i.config;
      },
      set config(u) {
      },
      use(u, ...g) {
        return l.has(u) || (u && $(u.install) ? (l.add(u), u.install(d, ...g)) : $(u) && (l.add(u), u(d, ...g))), d;
      },
      mixin(u) {
        return __VUE_OPTIONS_API__ && (i.mixins.includes(u) || i.mixins.push(u)), d;
      },
      component(u, g) {
        return g ? (i.components[u] = g, d) : i.components[u];
      },
      directive(u, g) {
        return g ? (i.directives[u] = g, d) : i.directives[u];
      },
      mount(u, g, T) {
        if (!f) {
          const A = d._ceVNode || Et(n, r);
          return A.appContext = i, T === !0 ? T = "svg" : T === !1 && (T = void 0), g && e ? e(A, u) : t(A, u, T), f = !0, d._container = u, u.__vue_app__ = d, __VUE_PROD_DEVTOOLS__ && (d._instance = A.component, Rl(d, on)), Mn(A.component);
        }
      },
      onUnmount(u) {
        o.push(u);
      },
      unmount() {
        f && (Rt(
          o,
          d._instance,
          16
        ), t(null, d._container), __VUE_PROD_DEVTOOLS__ && (d._instance = null, Dl(d)), delete d._container.__vue_app__);
      },
      provide(u, g) {
        return i.provides[u] = g, d;
      },
      runWithContext(u) {
        const g = xe;
        xe = d;
        try {
          return u();
        } finally {
          xe = g;
        }
      }
    };
    return d;
  };
}
let xe = null;
const Oo = (t, e) => e === "modelValue" || e === "model-value" ? t.modelModifiers : t[`${e}Modifiers`] || t[`${Pt(e)}Modifiers`] || t[`${re(e)}Modifiers`];
function Co(t, e, ...s) {
  if (t.isUnmounted) return;
  const n = t.vnode.props || et;
  let r = s;
  const i = e.startsWith("update:"), l = i && Oo(n, e.slice(7));
  l && (l.trim && (r = s.map((u) => st(u) ? u.trim() : u)), l.number && (r = r.map(Vi))), __VUE_PROD_DEVTOOLS__ && Nl(t, e, r);
  let o, f = n[o = Ds(e)] || // also try camelCase event handler (#2249)
  n[o = Ds(Pt(e))];
  !f && i && (f = n[o = Ds(re(e))]), f && Rt(
    f,
    t,
    6,
    r
  );
  const d = n[o + "Once"];
  if (d) {
    if (!t.emitted)
      t.emitted = {};
    else if (t.emitted[o])
      return;
    t.emitted[o] = !0, Rt(
      d,
      t,
      6,
      r
    );
  }
}
const Po = /* @__PURE__ */ new WeakMap();
function si(t, e, s = !1) {
  const n = __VUE_OPTIONS_API__ && s ? Po : e.emitsCache, r = n.get(t);
  if (r !== void 0)
    return r;
  const i = t.emits;
  let l = {}, o = !1;
  if (__VUE_OPTIONS_API__ && !$(t)) {
    const f = (d) => {
      const u = si(d, e, !0);
      u && (o = !0, pt(l, u));
    };
    !s && e.mixins.length && e.mixins.forEach(f), t.extends && f(t.extends), t.mixins && t.mixins.forEach(f);
  }
  return !i && !o ? (nt(t) && n.set(t, null), null) : (j(i) ? i.forEach((f) => l[f] = null) : pt(l, i), nt(t) && n.set(t, l), l);
}
function Ps(t, e) {
  return !t || !Ge(e) ? !1 : (e = e.slice(2), e = e === "Once" ? e : e.replace(/Once$/, ""), J(t, e[0].toLowerCase() + e.slice(1)) || J(t, re(e)) || J(t, e));
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
    render: d,
    renderCache: u,
    props: g,
    data: T,
    setupState: A,
    ctx: V,
    inheritAttrs: M
  } = t, K = us(t);
  let W, R;
  try {
    if (s.shapeFlag & 4) {
      const _ = r || n, C = _;
      W = At(
        d.call(
          C,
          _,
          u,
          g,
          A,
          T,
          V
        )
      ), R = o;
    } else {
      const _ = e;
      W = At(
        _.length > 1 ? _(
          g,
          { attrs: o, slots: l, emit: f }
        ) : _(
          g,
          null
        )
      ), R = e.props ? o : Mo(o);
    }
  } catch (_) {
    Te.length = 0, Ss(_, t, 1), W = Et(Gt);
  }
  let h = W;
  if (R && M !== !1) {
    const _ = Object.keys(R), { shapeFlag: C } = h;
    _.length && C & 7 && (i && _.some(ys) && (R = Io(
      R,
      i
    )), h = we(h, R, !1, !0));
  }
  if (s.dirs && (h = we(h, null, !1, !0), h.dirs = h.dirs ? h.dirs.concat(s.dirs) : s.dirs), s.transition) {
    const _ = Os(h.type) && Yr(h) || h;
    En(_, s.transition);
  }
  return W = h, us(K), W;
}
const Mo = (t) => {
  let e;
  for (const s in t)
    (s === "class" || s === "style" || Ge(s)) && ((e || (e = {}))[s] = t[s]);
  return e;
}, Io = (t, e) => {
  const s = {};
  for (const n in t)
    (!ys(n) || !(n.slice(9) in e)) && (s[n] = t[n]);
  return s;
};
function Ro(t, e, s) {
  const { props: n, children: r, component: i } = t, { props: l, children: o, patchFlag: f } = e, d = i.emitsOptions;
  if (e.dirs || e.transition)
    return !0;
  if (s && f >= 0) {
    if (f & 1024)
      return !0;
    if (f & 16)
      return n ? tr(n, l, d) : !!l;
    if (f & 8) {
      const u = e.dynamicProps;
      for (let g = 0; g < u.length; g++) {
        const T = u[g];
        if (ni(l, n, T) && !Ps(d, T))
          return !0;
      }
    }
  } else
    return (r || o) && (!o || !o.$stable) ? !0 : n === l ? !1 : n ? l ? tr(n, l, d) : !0 : !!l;
  return !1;
}
function tr(t, e, s) {
  const n = Object.keys(e);
  if (n.length !== Object.keys(t).length)
    return !0;
  for (let r = 0; r < n.length; r++) {
    const i = n[r];
    if (ni(e, t, i) && !Ps(s, i))
      return !0;
  }
  return !1;
}
function ni(t, e, s) {
  const n = t[s], r = e[s];
  return s === "style" && nt(n) && nt(r) ? !ws(n, r) : n !== r;
}
function ri({ vnode: t, parent: e, suspense: s }, n) {
  for (; e; ) {
    const r = e.subTree;
    if (r.suspense && r.suspense.activeBranch === t && (r.suspense.vnode.el = r.el = n, t = r), r === t)
      (t = e.vnode).el = n, e = e.parent;
    else
      break;
  }
  s && s.activeBranch === t && (s.vnode.el = n);
}
const ii = {}, li = () => Object.create(ii), oi = (t) => Object.getPrototypeOf(t) === ii;
function Do(t, e, s, n = !1) {
  const r = {}, i = li();
  t.propsDefaults = /* @__PURE__ */ Object.create(null), ci(t, e, r, i);
  for (const l in t.propsOptions[0])
    l in r || (r[l] = void 0);
  s ? t.props = n ? r : /* @__PURE__ */ pl(r) : t.type.props ? t.props = r : t.props = i, t.attrs = i;
}
function Ho(t, e, s, n) {
  const {
    props: r,
    attrs: i,
    vnode: { patchFlag: l }
  } = t, o = /* @__PURE__ */ G(r), [f] = t.propsOptions;
  let d = !1;
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
            A !== i[T] && (i[T] = A, d = !0);
          else {
            const V = Pt(T);
            r[V] = ln(
              f,
              o,
              V,
              A,
              t,
              !1
            );
          }
        else
          A !== i[T] && (i[T] = A, d = !0);
      }
    }
  } else {
    ci(t, e, r, i) && (d = !0);
    let u;
    for (const g in o)
      (!e || // for camelCase
      !J(e, g) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((u = re(g)) === g || !J(e, u))) && (f ? s && // for camelCase
      (s[g] !== void 0 || // for kebab-case
      s[u] !== void 0) && (r[g] = ln(
        f,
        o,
        g,
        void 0,
        t,
        !0
      )) : delete r[g]);
    if (i !== o)
      for (const g in i)
        (!e || !J(e, g)) && (delete i[g], d = !0);
  }
  d && Wt(t.attrs, "set", "");
}
function ci(t, e, s, n) {
  const [r, i] = t.propsOptions;
  let l = !1, o;
  if (e)
    for (let f in e) {
      if (ae(f))
        continue;
      const d = e[f];
      let u;
      r && J(r, u = Pt(f)) ? !i || !i.includes(u) ? s[u] = d : (o || (o = {}))[u] = d : Ps(t.emitsOptions, f) || (!(f in n) || d !== n[f]) && (n[f] = d, l = !0);
    }
  if (i) {
    const f = /* @__PURE__ */ G(s), d = o || et;
    for (let u = 0; u < i.length; u++) {
      const g = i[u];
      s[g] = ln(
        r,
        f,
        g,
        d[g],
        t,
        !J(d, g)
      );
    }
  }
  return l;
}
function ln(t, e, s, n, r, i) {
  const l = t[s];
  if (l != null) {
    const o = J(l, "default");
    if (o && n === void 0) {
      const f = l.default;
      if (l.type !== Function && !l.skipFactory && $(f)) {
        const { propsDefaults: d } = r;
        if (s in d)
          n = d[s];
        else {
          const u = Xe(r);
          n = d[s] = f.call(
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
const Lo = /* @__PURE__ */ new WeakMap();
function fi(t, e, s = !1) {
  const n = __VUE_OPTIONS_API__ && s ? Lo : e.propsCache, r = n.get(t);
  if (r)
    return r;
  const i = t.props, l = {}, o = [];
  let f = !1;
  if (__VUE_OPTIONS_API__ && !$(t)) {
    const u = (g) => {
      f = !0;
      const [T, A] = fi(g, e, !0);
      pt(l, T), A && o.push(...A);
    };
    !s && e.mixins.length && e.mixins.forEach(u), t.extends && u(t.extends), t.mixins && t.mixins.forEach(u);
  }
  if (!i && !f)
    return nt(t) && n.set(t, Ve), Ve;
  if (j(i))
    for (let u = 0; u < i.length; u++) {
      const g = Pt(i[u]);
      er(g) && (l[g] = et);
    }
  else if (i)
    for (const u in i) {
      const g = Pt(u);
      if (er(g)) {
        const T = i[u], A = l[g] = j(T) || $(T) ? { type: T } : pt({}, T), V = A.type;
        let M = !1, K = !0;
        if (j(V))
          for (let W = 0; W < V.length; ++W) {
            const R = V[W], h = $(R) && R.name;
            if (h === "Boolean") {
              M = !0;
              break;
            } else h === "String" && (K = !1);
          }
        else
          M = $(V) && V.name === "Boolean";
        A[
          0
          /* shouldCast */
        ] = M, A[
          1
          /* shouldCastTrue */
        ] = K, (M || J(A, "default")) && o.push(g);
      }
    }
  const d = [l, o];
  return nt(t) && n.set(t, d), d;
}
function er(t) {
  return t[0] !== "$" && !ae(t);
}
const An = (t) => t === "_" || t === "_ctx" || t === "$stable", On = (t) => j(t) ? t.map(At) : [At(t)], Vo = (t, e, s) => {
  if (e._n)
    return e;
  const n = Ul((...r) => On(e(...r)), s);
  return n._c = !1, n;
}, ai = (t, e, s) => {
  const n = t._ctx;
  for (const r in t) {
    if (An(r)) continue;
    const i = t[r];
    if ($(i))
      e[r] = Vo(r, i, n);
    else if (i != null) {
      const l = On(i);
      e[r] = () => l;
    }
  }
}, ui = (t, e) => {
  const s = On(e);
  t.slots.default = () => s;
}, di = (t, e, s) => {
  for (const n in e)
    (s || !An(n)) && (t[n] = e[n]);
}, No = (t, e, s) => {
  const n = t.slots = li();
  if (t.vnode.shapeFlag & 32) {
    const r = e._;
    r ? (di(n, e, s), s && Ee(n, "_", r, !0)) : ai(e, n);
  } else e && ui(t, e);
}, Uo = (t, e, s) => {
  const { vnode: n, slots: r } = t;
  let i = !0, l = et;
  if (n.shapeFlag & 32) {
    const o = e._;
    o ? s && o === 1 ? i = !1 : di(r, e, s) : (i = !e.$stable, ai(e, r)), l = e;
  } else e && (ui(t, e), l = { default: 1 });
  if (i)
    for (const o in r)
      !An(o) && l[o] == null && delete r[o];
};
function Fo() {
  typeof __VUE_OPTIONS_API__ != "boolean" && (ue().__VUE_OPTIONS_API__ = !0), typeof __VUE_PROD_DEVTOOLS__ != "boolean" && (ue().__VUE_PROD_DEVTOOLS__ = !1), typeof __VUE_PROD_HYDRATION_MISMATCH_DETAILS__ != "boolean" && (ue().__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = !1);
}
const mt = bi;
function $o(t) {
  return hi(t);
}
function jo(t) {
  return hi(t, Xl);
}
function hi(t, e) {
  Fo();
  const s = ue();
  s.__VUE__ = !0, __VUE_PROD_DEVTOOLS__ && $r(s.__VUE_DEVTOOLS_GLOBAL_HOOK__, s);
  const {
    insert: n,
    remove: r,
    patchProp: i,
    createElement: l,
    createText: o,
    createComment: f,
    setText: d,
    setElementText: u,
    parentNode: g,
    nextSibling: T,
    setScopeId: A = Ct,
    insertStaticContent: V
  } = t, M = (c, a, p, x = null, b = null, m = null, w = void 0, E = null, v = !!a.dynamicChildren) => {
    if (c === a)
      return;
    c && !Ie(c, a) && (x = Qe(c), it(c, b, m, !0), c = null), a.patchFlag === -2 && (v = !1, a.dynamicChildren = null);
    const { type: y, ref: D, shapeFlag: O } = a;
    switch (y) {
      case ee:
        K(c, a, p, x);
        break;
      case Gt:
        W(c, a, p, x);
        break;
      case ve:
        c == null && R(a, p, x, w);
        break;
      case St:
        ot(
          c,
          a,
          p,
          x,
          b,
          m,
          w,
          E,
          v
        );
        break;
      default:
        O & 1 ? C(
          c,
          a,
          p,
          x,
          b,
          m,
          w,
          E,
          v
        ) : O & 6 ? lt(
          c,
          a,
          p,
          x,
          b,
          m,
          w,
          E,
          v
        ) : (O & 64 || O & 128) && y.process(
          c,
          a,
          p,
          x,
          b,
          m,
          w,
          E,
          v,
          pe
        );
    }
    D != null && b ? be(D, c && c.ref, m, a || c, !a) : D == null && c && c.ref != null && be(c.ref, null, m, c, !0);
  }, K = (c, a, p, x) => {
    if (c == null)
      n(
        a.el = o(a.children),
        p,
        x
      );
    else {
      const b = a.el = c.el;
      a.children !== c.children && d(b, a.children);
    }
  }, W = (c, a, p, x) => {
    c == null ? n(
      a.el = f(a.children || ""),
      p,
      x
    ) : a.el = c.el;
  }, R = (c, a, p, x) => {
    [c.el, c.anchor] = V(
      c.children,
      a,
      p,
      x,
      c.el,
      c.anchor
    );
  }, h = ({ el: c, anchor: a }, p, x) => {
    let b;
    for (; c && c !== a; )
      b = T(c), n(c, p, x), c = b;
    n(a, p, x);
  }, _ = ({ el: c, anchor: a }) => {
    let p;
    for (; c && c !== a; )
      p = T(c), r(c), c = p;
    r(a);
  }, C = (c, a, p, x, b, m, w, E, v) => {
    if (a.type === "svg" ? w = "svg" : a.type === "math" && (w = "mathml"), c == null)
      B(
        a,
        p,
        x,
        b,
        m,
        w,
        E,
        v
      );
    else {
      const y = c.el && c.el._isVueCE ? c.el : null;
      try {
        y && y._beginPatch(), N(
          c,
          a,
          b,
          m,
          w,
          E,
          v
        );
      } finally {
        y && y._endPatch();
      }
    }
  }, B = (c, a, p, x, b, m, w, E) => {
    let v, y;
    const { props: D, shapeFlag: O, transition: I, dirs: L } = c;
    if (v = c.el = l(
      c.type,
      m,
      D && D.is,
      D
    ), O & 8 ? u(v, c.children) : O & 16 && F(
      c.children,
      v,
      null,
      x,
      b,
      Ks(c, m),
      w,
      E
    ), L && Lt(c, null, x, "created"), P(v, c, c.scopeId, w, x), D) {
      for (const Q in D)
        Q !== "value" && !ae(Q) && i(v, Q, null, D[Q], m, x);
      "value" in D && i(v, "value", null, D.value, m), (y = D.onVnodeBeforeMount) && wt(y, x, c);
    }
    __VUE_PROD_DEVTOOLS__ && (Ee(v, "__vnode", c, !0), Ee(v, "__vueParentComponent", x, !0)), L && Lt(c, null, x, "beforeMount");
    const q = pi(b, I);
    q && I.beforeEnter(v), n(v, a, p), ((y = D && D.onVnodeMounted) || q || L) && mt(() => {
      try {
        y && wt(y, x, c), q && I.enter(v), L && Lt(c, null, x, "mounted");
      } finally {
      }
    }, b);
  }, P = (c, a, p, x, b) => {
    if (p && A(c, p), x)
      for (let m = 0; m < x.length; m++)
        A(c, x[m]);
    if (b) {
      let m = b.subTree;
      if (a === m || mi(m.type) && (m.ssContent === a || m.ssFallback === a)) {
        const w = b.vnode;
        P(
          c,
          w,
          w.scopeId,
          w.slotScopeIds,
          b.parent
        );
      }
    }
  }, F = (c, a, p, x, b, m, w, E, v = 0) => {
    for (let y = v; y < c.length; y++) {
      const D = c[y] = E ? Bt(c[y]) : At(c[y]);
      M(
        null,
        D,
        a,
        p,
        x,
        b,
        m,
        w,
        E
      );
    }
  }, N = (c, a, p, x, b, m, w) => {
    const E = a.el = c.el;
    __VUE_PROD_DEVTOOLS__ && (E.__vnode = a);
    let { patchFlag: v, dynamicChildren: y, dirs: D } = a;
    v |= c.patchFlag & 16;
    const O = c.props || et, I = a.props || et;
    let L;
    if (p && le(p, !1), (L = I.onVnodeBeforeUpdate) && wt(L, p, a, c), D && Lt(a, c, p, "beforeUpdate"), p && le(p, !0), // #6385 the old vnode may be a user-wrapped non-isomorphic block
    // Force full diff when block metadata is unstable.
    y && (!c.dynamicChildren || c.dynamicChildren.length !== y.length) && (v = 0, w = !1, y = null), (O.innerHTML && I.innerHTML == null || O.textContent && I.textContent == null) && u(E, ""), y ? Y(
      c.dynamicChildren,
      y,
      E,
      p,
      x,
      Ks(a, b),
      m
    ) : w || k(
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
        U(E, O, I, p, b);
      else if (v & 2 && O.class !== I.class && i(E, "class", null, I.class, b), v & 4 && i(E, "style", O.style, I.style, b), v & 8) {
        const q = a.dynamicProps;
        for (let Q = 0; Q < q.length; Q++) {
          const X = q[Q], ct = O[X], ft = I[X];
          (ft !== ct || X === "value") && i(E, X, ct, ft, b, p);
        }
      }
      v & 1 && c.children !== a.children && u(E, a.children);
    } else !w && y == null && U(E, O, I, p, b);
    ((L = I.onVnodeUpdated) || D) && mt(() => {
      L && wt(L, p, a, c), D && Lt(a, c, p, "updated");
    }, x);
  }, Y = (c, a, p, x, b, m, w) => {
    for (let E = 0; E < a.length; E++) {
      const v = c[E], y = a[E], D = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        v.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (v.type === St || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !Ie(v, y) || // - In the case of a component, it could contain anything.
        v.shapeFlag & 198) ? g(v.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          p
        )
      );
      M(
        v,
        y,
        D,
        null,
        x,
        b,
        m,
        w,
        !0
      );
    }
  }, U = (c, a, p, x, b) => {
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
        const w = p[m], E = a[m];
        w !== E && m !== "value" && i(c, m, E, w, b, x);
      }
      "value" in p && i(c, "value", a.value, p.value, b);
    }
  }, ot = (c, a, p, x, b, m, w, E, v) => {
    const y = a.el = c ? c.el : o(""), D = a.anchor = c ? c.anchor : o("");
    let { patchFlag: O, dynamicChildren: I, slotScopeIds: L } = a;
    L && (E = E ? E.concat(L) : L), c == null ? (n(y, p, x), n(D, p, x), F(
      // #10007
      // such fragment like `<></>` will be compiled into
      // a fragment which doesn't have a children.
      // In this case fallback to an empty array
      a.children || [],
      p,
      D,
      b,
      m,
      w,
      E,
      v
    )) : O > 0 && O & 64 && I && // #2715 the previous fragment could've been a BAILed one as a result
    // of renderSlot() with no valid children
    c.dynamicChildren && c.dynamicChildren.length === I.length ? (Y(
      c.dynamicChildren,
      I,
      p,
      b,
      m,
      w,
      E
    ), // #2080 if the stable fragment has a key, it's a <template v-for> that may
    //  get moved around. Make sure all root level vnodes inherit el.
    // #2134 or if it's a component root, it may also get moved around
    // as the component is being moved.
    (a.key != null || b && a === b.subTree) && Cn(
      c,
      a,
      !0
      /* shallow */
    )) : k(
      c,
      a,
      p,
      D,
      b,
      m,
      w,
      E,
      v
    );
  }, lt = (c, a, p, x, b, m, w, E, v) => {
    a.slotScopeIds = E, c == null ? a.shapeFlag & 512 ? b.ctx.activate(
      a,
      p,
      x,
      w,
      v
    ) : rt(
      a,
      p,
      x,
      b,
      m,
      w,
      v
    ) : ut(c, a, v);
  }, rt = (c, a, p, x, b, m, w) => {
    const E = c.component = Jo(
      c,
      x,
      b
    );
    if (Sn(c) && (E.ctx.renderer = pe), Zo(E, !1, w), E.asyncDep) {
      if (b && b.registerDep(E, H, w), !c.el) {
        const v = E.subTree = Et(Gt);
        W(null, v, a, p), c.placeholder = v.el;
      }
    } else
      H(
        E,
        c,
        a,
        p,
        b,
        m,
        w
      );
  }, ut = (c, a, p) => {
    const x = a.component = c.component;
    if (Ro(c, a, p))
      if (x.asyncDep && !x.asyncResolved) {
        z(x, a, p);
        return;
      } else
        x.next = a, x.update();
    else
      a.el = c.el, x.vnode = a;
  }, H = (c, a, p, x, b, m, w) => {
    const E = () => {
      if (c.isMounted) {
        let { next: O, bu: I, u: L, parent: q, vnode: Q } = c;
        {
          const vt = gi(c);
          if (vt) {
            O && (O.el = Q.el, z(c, O, w)), vt.asyncDep.then(() => {
              mt(() => {
                c.isUnmounted || y();
              }, b);
            });
            return;
          }
        }
        let X = O, ct;
        le(c, !1), O ? (O.el = Q.el, z(c, O, w)) : O = Q, I && Hs(I), (ct = O.props && O.props.onVnodeBeforeUpdate) && wt(ct, q, O, Q), le(c, !0);
        const ft = ks(c), Ot = c.subTree;
        c.subTree = ft, M(
          Ot,
          ft,
          // parent may have changed if it's in a teleport
          g(Ot.el),
          // anchor may have changed if it's in a fragment
          Qe(Ot),
          c,
          b,
          m
        ), O.el = ft.el, X === null && ri(c, ft.el), L && mt(L, b), (ct = O.props && O.props.onVnodeUpdated) && mt(
          () => wt(ct, q, O, Q),
          b
        ), __VUE_PROD_DEVTOOLS__ && jr(c);
      } else {
        let O;
        const { el: I, props: L } = a, { bm: q, m: Q, parent: X, root: ct, type: ft } = c, Ot = ye(a);
        if (le(c, !1), q && Hs(q), !Ot && (O = L && L.onVnodeBeforeMount) && wt(O, X, a), le(c, !0), I && Rs) {
          const vt = () => {
            c.subTree = ks(c), Rs(
              I,
              c.subTree,
              c,
              b,
              null
            );
          };
          Ot && ft.__asyncHydrate ? ft.__asyncHydrate(
            I,
            c,
            vt
          ) : vt();
        } else {
          ct.ce && ct.ce._hasShadowRoot() && ct.ce._injectChildStyle(
            ft,
            c.parent ? c.parent.type : void 0
          );
          const vt = c.subTree = ks(c);
          M(
            null,
            vt,
            p,
            x,
            c,
            b,
            m
          ), a.el = vt.el;
        }
        if (Q && mt(Q, b), !Ot && (O = L && L.onVnodeMounted)) {
          const vt = a;
          mt(
            () => wt(O, X, vt),
            b
          );
        }
        (a.shapeFlag & 256 || X && ye(X.vnode) && X.vnode.shapeFlag & 256) && c.a && mt(c.a, b), c.isMounted = !0, __VUE_PROD_DEVTOOLS__ && Hl(c), a = p = x = null;
      }
    };
    c.scope.on();
    const v = c.effect = new vr(E);
    c.scope.off();
    const y = c.update = v.run.bind(v), D = c.job = v.runIfDirty.bind(v);
    D.i = c, D.id = c.uid, v.scheduler = () => vn(D), le(c, !0), y();
  }, z = (c, a, p) => {
    a.component = c;
    const x = c.vnode.props;
    c.vnode = a, c.next = null, Ho(c, a.props, x, p), Uo(c, a.children, p), $t(), jn(c), jt();
  }, k = (c, a, p, x, b, m, w, E, v = !1) => {
    const y = c && c.children, D = c ? c.shapeFlag : 0, O = a.children, { patchFlag: I, shapeFlag: L } = a;
    if (I > 0) {
      if (I & 128) {
        Z(
          y,
          O,
          p,
          x,
          b,
          m,
          w,
          E,
          v
        );
        return;
      } else if (I & 256) {
        xt(
          y,
          O,
          p,
          x,
          b,
          m,
          w,
          E,
          v
        );
        return;
      }
    }
    L & 8 ? (D & 16 && Oe(y, b, m), O !== y && u(p, O)) : D & 16 ? L & 16 ? Z(
      y,
      O,
      p,
      x,
      b,
      m,
      w,
      E,
      v
    ) : Oe(y, b, m, !0) : (D & 8 && u(p, ""), L & 16 && F(
      O,
      p,
      x,
      b,
      m,
      w,
      E,
      v
    ));
  }, xt = (c, a, p, x, b, m, w, E, v) => {
    c = c || Ve, a = a || Ve;
    const y = c.length, D = a.length, O = Math.min(y, D);
    let I;
    for (I = 0; I < O; I++) {
      const L = a[I] = v ? Bt(a[I]) : At(a[I]);
      M(
        c[I],
        L,
        p,
        null,
        b,
        m,
        w,
        E,
        v
      );
    }
    y > D ? Oe(
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
      w,
      E,
      v,
      O
    );
  }, Z = (c, a, p, x, b, m, w, E, v) => {
    let y = 0;
    const D = a.length;
    let O = c.length - 1, I = D - 1;
    for (; y <= O && y <= I; ) {
      const L = c[y], q = a[y] = v ? Bt(a[y]) : At(a[y]);
      if (Ie(L, q))
        M(
          L,
          q,
          p,
          null,
          b,
          m,
          w,
          E,
          v
        );
      else
        break;
      y++;
    }
    for (; y <= O && y <= I; ) {
      const L = c[O], q = a[I] = v ? Bt(a[I]) : At(a[I]);
      if (Ie(L, q))
        M(
          L,
          q,
          p,
          null,
          b,
          m,
          w,
          E,
          v
        );
      else
        break;
      O--, I--;
    }
    if (y > O) {
      if (y <= I) {
        const L = I + 1, q = L < D ? a[L].el : x;
        for (; y <= I; )
          M(
            null,
            a[y] = v ? Bt(a[y]) : At(a[y]),
            p,
            q,
            b,
            m,
            w,
            E,
            v
          ), y++;
      }
    } else if (y > I)
      for (; y <= O; )
        it(c[y], b, m, !0), y++;
    else {
      const L = y, q = y, Q = /* @__PURE__ */ new Map();
      for (y = q; y <= I; y++) {
        const Tt = a[y] = v ? Bt(a[y]) : At(a[y]);
        Tt.key != null && Q.set(Tt.key, y);
      }
      let X, ct = 0;
      const ft = I - q + 1;
      let Ot = !1, vt = 0;
      const Ce = new Array(ft);
      for (y = 0; y < ft; y++) Ce[y] = 0;
      for (y = L; y <= O; y++) {
        const Tt = c[y];
        if (ct >= ft) {
          it(Tt, b, m, !0);
          continue;
        }
        let Dt;
        if (Tt.key != null)
          Dt = Q.get(Tt.key);
        else
          for (X = q; X <= I; X++)
            if (Ce[X - q] === 0 && Ie(Tt, a[X])) {
              Dt = X;
              break;
            }
        Dt === void 0 ? it(Tt, b, m, !0) : (Ce[Dt - q] = y + 1, Dt >= vt ? vt = Dt : Ot = !0, M(
          Tt,
          a[Dt],
          p,
          null,
          b,
          m,
          w,
          E,
          v
        ), ct++);
      }
      const Rn = Ot ? ko(Ce) : Ve;
      for (X = Rn.length - 1, y = ft - 1; y >= 0; y--) {
        const Tt = q + y, Dt = a[Tt], Dn = a[Tt + 1], Hn = Tt + 1 < D ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          Dn.el || _i(Dn)
        ) : x;
        Ce[y] === 0 ? M(
          null,
          Dt,
          p,
          Hn,
          b,
          m,
          w,
          E,
          v
        ) : Ot && (X < 0 || y !== Rn[X] ? at(Dt, p, Hn, 2) : X--);
      }
    }
  }, at = (c, a, p, x, b = null) => {
    const { el: m, type: w, transition: E, children: v, shapeFlag: y } = c;
    if (y & 6) {
      at(c.component.subTree, a, p, x);
      return;
    }
    if (y & 128) {
      c.suspense.move(a, p, x);
      return;
    }
    if (y & 64) {
      w.move(c, a, p, pe);
      return;
    }
    if (w === St) {
      n(m, a, p);
      for (let O = 0; O < v.length; O++)
        at(v[O], a, p, x);
      n(c.anchor, a, p);
      return;
    }
    if (w === ve) {
      h(c, a, p);
      return;
    }
    if (x !== 2 && y & 1 && E)
      if (x === 0)
        E.persisted && !m[$s] ? n(m, a, p) : (E.beforeEnter(m), n(m, a, p), mt(() => E.enter(m), b));
      else {
        const { leave: O, delayLeave: I, afterLeave: L } = E, q = () => {
          c.ctx.isUnmounted ? r(m) : n(m, a, p);
        }, Q = () => {
          const X = m._isLeaving || !!m[$s];
          m._isLeaving && m[$s](
            !0
            /* cancelled */
          ), E.persisted && !X ? q() : O(m, () => {
            q(), L && L();
          });
        };
        I ? I(m, q, Q) : Q();
      }
    else
      n(m, a, p);
  }, it = (c, a, p, x = !1, b = !1) => {
    const {
      type: m,
      props: w,
      ref: E,
      children: v,
      dynamicChildren: y,
      shapeFlag: D,
      patchFlag: O,
      dirs: I,
      cacheIndex: L,
      memo: q
    } = c;
    if (O === -2 && (b = !1), E != null && ($t(), be(E, null, p, c, !0), jt()), L != null && (a.renderCache[L] = void 0), D & 256) {
      a.ctx.deactivate(c);
      return;
    }
    const Q = D & 1 && I, X = !ye(c);
    let ct;
    if (X && (ct = w && w.onVnodeBeforeUnmount) && wt(ct, a, c), D & 6)
      Pi(c.component, p, x);
    else {
      if (D & 128) {
        c.suspense.unmount(p, x);
        return;
      }
      Q && Lt(c, null, a, "beforeUnmount"), D & 64 ? c.type.remove(
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
      (m !== St || O > 0 && O & 64) ? Oe(
        y,
        a,
        p,
        !1,
        !0
      ) : (m === St && O & 384 || !b && D & 16) && Oe(v, a, p), x && Ze(c);
    }
    const ft = q != null && L == null;
    (X && (ct = w && w.onVnodeUnmounted) || Q || ft) && mt(() => {
      ct && wt(ct, a, c), Q && Lt(c, null, a, "unmounted"), ft && (c.el = null);
    }, p);
  }, Ze = (c) => {
    const { type: a, el: p, anchor: x, transition: b } = c;
    if (a === St) {
      Ci(p, x);
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
      const { leave: w, delayLeave: E } = b, v = () => w(p, m);
      E ? E(c.el, m, v) : v();
    } else
      m();
  }, Ci = (c, a) => {
    let p;
    for (; c !== a; )
      p = T(c), r(c), c = p;
    r(a);
  }, Pi = (c, a, p) => {
    const { bum: x, scope: b, job: m, subTree: w, um: E, m: v, a: y } = c;
    sr(v), sr(y), x && Hs(x), b.stop(), m && (m.flags |= 8, it(w, c, a, p)), E && mt(E, a), mt(() => {
      c.isUnmounted = !0;
    }, a), __VUE_PROD_DEVTOOLS__ && Vl(c);
  }, Oe = (c, a, p, x = !1, b = !1, m = 0) => {
    for (let w = m; w < c.length; w++)
      it(c[w], a, p, x, b);
  }, Qe = (c) => {
    if (c.shapeFlag & 6)
      return Qe(c.component.subTree);
    if (c.shapeFlag & 128)
      return c.suspense.next();
    const a = T(c.anchor || c.el), p = a && a[Wr];
    return p ? T(p) : a;
  };
  let Ms = !1;
  const In = (c, a, p) => {
    let x;
    c == null ? a._vnode && (it(a._vnode, null, null, !0), x = a._vnode.component) : M(
      a._vnode || null,
      c,
      a,
      null,
      null,
      null,
      p
    ), a._vnode = c, Ms || (Ms = !0, jn(x), as(), Ms = !1);
  }, pe = {
    p: M,
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
    render: In,
    hydrate: Is,
    createApp: Ao(In, Is)
  };
}
function Ks({ type: t, props: e }, s) {
  return s === "svg" && t === "foreignObject" || s === "mathml" && t === "annotation-xml" && e && e.encoding && e.encoding.includes("html") ? void 0 : s;
}
function le({ effect: t, job: e }, s) {
  s ? (t.flags |= 32, e.flags |= 4) : (t.flags &= -33, e.flags &= -5);
}
function pi(t, e) {
  return (!t || t && !t.pendingBranch) && e && !e.persisted;
}
function Cn(t, e, s = !1) {
  const n = t.children, r = e.children;
  if (j(n) && j(r))
    for (let i = 0; i < n.length; i++) {
      const l = n[i];
      let o = r[i];
      o.shapeFlag & 1 && !o.dynamicChildren && ((o.patchFlag <= 0 || o.patchFlag === 32) && (o = r[i] = Bt(r[i]), o.el = l.el), !s && o.patchFlag !== -2 && Cn(l, o)), o.type === ee && (o.patchFlag === -1 && (o = r[i] = Bt(o)), o.el = l.el), o.type === Gt && !o.el && (o.el = l.el);
    }
}
function ko(t) {
  const e = t.slice(), s = [0];
  let n, r, i, l, o;
  const f = t.length;
  for (n = 0; n < f; n++) {
    const d = t[n];
    if (d !== 0) {
      if (r = s[s.length - 1], t[r] < d) {
        e[n] = r, s.push(n);
        continue;
      }
      for (i = 0, l = s.length - 1; i < l; )
        o = i + l >> 1, t[s[o]] < d ? i = o + 1 : l = o;
      d < t[s[i]] && (i > 0 && (e[n] = s[i - 1]), s[i] = n);
    }
  }
  for (i = s.length, l = s[i - 1]; i-- > 0; )
    s[i] = l, l = e[l];
  return s;
}
function gi(t) {
  const e = t.subTree.component;
  if (e)
    return e.asyncDep && !e.asyncResolved ? e : gi(e);
}
function sr(t) {
  if (t)
    for (let e = 0; e < t.length; e++)
      t[e].flags |= 8;
}
function _i(t) {
  if (t.placeholder)
    return t.placeholder;
  const e = t.component;
  return e ? _i(e.subTree) : null;
}
const mi = (t) => t.__isSuspense;
function bi(t, e) {
  e && e.pendingBranch ? j(t) ? e.effects.push(...t) : e.effects.push(t) : Il(t);
}
const St = /* @__PURE__ */ Symbol.for("v-fgt"), ee = /* @__PURE__ */ Symbol.for("v-txt"), Gt = /* @__PURE__ */ Symbol.for("v-cmt"), ve = /* @__PURE__ */ Symbol.for("v-stc"), Te = [];
let Yt = null;
function Ko() {
  Te.pop(), Yt = Te[Te.length - 1] || null;
}
let Pn = 1;
function gs(t, e = !1) {
  Pn += t, t < 0 && Yt && e && (Yt.hasOnce = !0);
}
function _s(t) {
  return t ? t.__v_isVNode === !0 : !1;
}
function Ie(t, e) {
  return t.type === e.type && t.key === e.key;
}
const yi = ({ key: t }) => t ?? null, os = ({
  ref: t,
  ref_key: e,
  ref_for: s
}) => (typeof t == "number" && (t = "" + t), t != null ? st(t) || /* @__PURE__ */ ht(t) || $(t) ? { i: Ft, r: t, k: e, f: !!s } : t : null);
function Bo(t, e = null, s = null, n = 0, r = null, i = t === St ? 0 : 1, l = !1, o = !1) {
  const f = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: t,
    props: e,
    key: e && yi(e),
    ref: e && os(e),
    scopeId: kr,
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
  return o ? (ms(f, s), i & 128 && t.normalize(f)) : s && (f.shapeFlag |= st(s) ? 8 : 16), Pn > 0 && // avoid a block node from tracking itself
  !l && // has current parent block
  Yt && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (f.patchFlag > 0 || i & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  f.patchFlag !== 32 && Yt.push(f), f;
}
const Et = Wo;
function Wo(t, e = null, s = null, n = 0, r = null, i = !1) {
  if ((!t || t === bo) && (t = Gt), _s(t)) {
    const o = we(
      t,
      e,
      !0
      /* mergeRef: true */
    );
    return s && ms(o, s), Pn > 0 && !i && Yt && (o.shapeFlag & 6 ? Yt[Yt.indexOf(t)] = o : Yt.push(o)), o.patchFlag = -2, o;
  }
  if (ic(t) && (t = t.__vccOpts), e) {
    e = Yo(e);
    let { class: o, style: f } = e;
    o && !st(o) && (e.class = Ts(o)), nt(f) && (/* @__PURE__ */ xn(f) && !j(f) && (f = pt({}, f)), e.style = vs(f));
  }
  const l = st(t) ? 1 : mi(t) ? 128 : Os(t) ? 64 : nt(t) ? 4 : $(t) ? 2 : 0;
  return Bo(
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
function Yo(t) {
  return t ? /* @__PURE__ */ xn(t) || oi(t) ? pt({}, t) : t : null;
}
function we(t, e, s = !1, n = !1) {
  const { props: r, ref: i, patchFlag: l, children: o, transition: f } = t, d = e ? qo(r || {}, e) : r, u = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: t.type,
    props: d,
    key: d && yi(d),
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
    patchFlag: e && t.type !== St ? l === -1 ? 16 : l | 16 : l,
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
    ssContent: t.ssContent && we(t.ssContent),
    ssFallback: t.ssFallback && we(t.ssFallback),
    placeholder: t.placeholder,
    el: t.el,
    anchor: t.anchor,
    ctx: t.ctx,
    ce: t.ce
  };
  return f && n && En(
    u,
    f.clone(u)
  ), u;
}
function xi(t = " ", e = 0) {
  return Et(ee, null, t, e);
}
function At(t) {
  return t == null || typeof t == "boolean" ? Et(Gt) : j(t) ? Et(
    St,
    null,
    // #3666, avoid reference pollution when reusing vnode
    t.slice()
  ) : _s(t) ? Bt(t) : Et(ee, null, String(t));
}
function Bt(t) {
  return t.el === null && t.patchFlag !== -1 || t.memo ? t : we(t);
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
      !r && !oi(e) ? e._ctx = Ft : r === 3 && Ft && (Ft.slots._ === 1 ? e._ = 1 : (e._ = 2, t.patchFlag |= 1024));
    }
  else if ($(e)) {
    if (n & 65) {
      ms(t, { default: e });
      return;
    }
    e = { default: e, _ctx: Ft }, s = 32;
  } else
    e = String(e), n & 64 ? (s = 16, e = [xi(e)]) : s = 8;
  t.children = e, t.shapeFlag |= s;
}
function qo(...t) {
  const e = {};
  for (let s = 0; s < t.length; s++) {
    const n = t[s];
    for (const r in n)
      if (r === "class")
        e.class !== n.class && (e.class = Ts([e.class, n.class]));
      else if (r === "style")
        e.style = vs([e.style, n.style]);
      else if (Ge(r)) {
        const i = e[r], l = n[r];
        l && i !== l && !(j(i) && i.includes(l)) ? e[r] = i ? [].concat(i, l) : l : l == null && i == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !ys(r) && (e[r] = l);
      } else r !== "" && (e[r] = n[r]);
  }
  return e;
}
function wt(t, e, s, n = null) {
  Rt(t, e, 7, [
    s,
    n
  ]);
}
const zo = ei();
let Go = 0;
function Jo(t, e, s) {
  const n = t.type, r = (e ? e.appContext : t.appContext) || zo, i = {
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
    scope: new Gi(
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
    propsOptions: fi(n, r),
    emitsOptions: si(n, r),
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
  return i.ctx = { _: i }, i.root = e ? e.root : i, i.emit = Co.bind(null, i), t.ce && t.ce(i), i;
}
let yt = null;
const Xo = () => yt || Ft;
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
    (s) => ze = s
  );
}
const Xe = (t) => {
  const e = yt;
  return bs(t), t.scope.on(), () => {
    t.scope.off(), bs(e);
  };
}, nr = () => {
  yt && yt.scope.off(), bs(null);
};
function vi(t) {
  return t.vnode.shapeFlag & 4;
}
let ze = !1;
function Zo(t, e = !1, s = !1) {
  e && qe(e);
  const { props: n, children: r } = t.vnode, i = vi(t);
  Do(t, n, i, e), No(t, r, s || e);
  const l = i ? Qo(t, e) : void 0;
  return e && qe(!1), l;
}
function Qo(t, e) {
  const s = t.type;
  t.accessCache = /* @__PURE__ */ Object.create(null), t.proxy = new Proxy(t.ctx, yo);
  const { setup: n } = s;
  if (n) {
    $t();
    const r = t.setupContext = n.length > 1 ? ec(t) : null, i = Xe(t), l = Ae(
      n,
      t,
      0,
      [
        t.props,
        r
      ]
    ), o = mr(l);
    if (jt(), i(), (o || t.sp) && !ye(t) && qr(t), o) {
      if (l.then(nr, nr), e)
        return l.then((f) => {
          qe(!0);
          try {
            rr(t, f, e);
          } finally {
            qe(!1);
          }
        }).catch((f) => {
          Ss(f, t, 0);
        });
      t.asyncDep = l;
    } else
      rr(t, l);
  } else
    Ti(t);
}
function rr(t, e, s) {
  $(e) ? t.type.__ssrInlineRender ? t.ssrRender = e : t.render = e : nt(e) && (__VUE_PROD_DEVTOOLS__ && (t.devtoolsRawSetupState = e), t.setupState = Lr(e)), Ti(t);
}
function Ti(t, e, s) {
  const n = t.type;
  if (t.render || (t.render = n.render || Ct), __VUE_OPTIONS_API__) {
    const r = Xe(t);
    $t();
    try {
      xo(t);
    } finally {
      jt(), r();
    }
  }
}
const tc = {
  get(t, e) {
    return gt(t, "get", ""), t[e];
  }
};
function ec(t) {
  const e = (s) => {
    t.exposed = s || {};
  };
  return {
    attrs: new Proxy(t.attrs, tc),
    slots: t.slots,
    emit: t.emit,
    expose: e
  };
}
function Mn(t) {
  return t.exposed ? t.exposeProxy || (t.exposeProxy = new Proxy(Lr(gl(t.exposed)), {
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
const sc = /(?:^|[-_])\w/g, nc = (t) => t.replace(sc, (e) => e.toUpperCase()).replace(/[-_]/g, "");
function rc(t, e = !0) {
  return $(t) ? t.displayName || t.name : t.name || e && t.__name;
}
function Ei(t, e, s = !1) {
  let n = rc(e);
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
  return n ? nc(n) : s ? "App" : "Anonymous";
}
function ic(t) {
  return $(t) && "__vccOpts" in t;
}
const lc = (t, e) => /* @__PURE__ */ vl(t, e, ze);
function S(t, e, s) {
  try {
    gs(-1);
    const n = arguments.length;
    return n === 2 ? nt(e) && !j(e) ? _s(e) ? Et(t, null, [e]) : Et(t, e) : Et(t, null, e) : (n > 3 ? s = Array.prototype.slice.call(arguments, 2) : n === 3 && _s(s) && (s = [s]), Et(t, e, s));
  } finally {
    gs(1);
  }
}
const on = "3.5.42";
/**
* @vue/runtime-dom v3.5.42
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let cn;
const ir = typeof window < "u" && window.trustedTypes;
if (ir)
  try {
    cn = /* @__PURE__ */ ir.createPolicy("vue", {
      createHTML: (t) => t
    });
  } catch {
  }
const wi = cn ? (t) => cn.createHTML(t) : (t) => t, oc = "http://www.w3.org/2000/svg", cc = "http://www.w3.org/1998/Math/MathML", Kt = typeof document < "u" ? document : null, lr = Kt && /* @__PURE__ */ Kt.createElement("template"), fc = {
  insert: (t, e, s) => {
    e.insertBefore(t, s || null);
  },
  remove: (t) => {
    const e = t.parentNode;
    e && e.removeChild(t);
  },
  createElement: (t, e, s, n) => {
    const r = e === "svg" ? Kt.createElementNS(oc, t) : e === "mathml" ? Kt.createElementNS(cc, t) : s ? Kt.createElement(t, { is: s }) : Kt.createElement(t);
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
      lr.innerHTML = wi(
        n === "svg" ? `<svg>${t}</svg>` : n === "mathml" ? `<math>${t}</math>` : t
      );
      const o = lr.content;
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
}, ac = /* @__PURE__ */ Symbol("_vtc");
function uc(t, e, s) {
  const n = t[ac];
  n && (e = (e ? [e, ...n] : [...n]).join(" ")), e == null ? t.removeAttribute("class") : s ? t.setAttribute("class", e) : t.className = e;
}
const or = /* @__PURE__ */ Symbol("_vod"), dc = /* @__PURE__ */ Symbol("_vsh"), hc = /* @__PURE__ */ Symbol(""), pc = /(?:^|;)\s*display\s*:/;
function gc(t, e, s) {
  const n = t.style, r = st(s);
  let i = !1;
  if (s && !r) {
    if (e)
      if (st(e))
        for (const l of e.split(";")) {
          const o = l.slice(0, l.indexOf(":")).trim();
          s[o] == null && Le(n, o, "");
        }
      else
        for (const l in e)
          s[l] == null && Le(n, l, "");
    for (const l in s) {
      l === "display" && (i = !0);
      const o = s[l];
      o != null ? mc(
        t,
        l,
        !st(e) && e ? e[l] : void 0,
        o
      ) || Le(n, l, o) : Le(n, l, "");
    }
  } else if (r) {
    if (e !== s) {
      const l = n[hc];
      l && (s += ";" + l), n.cssText = s, i = pc.test(s);
    }
  } else e && t.removeAttribute("style");
  or in t && (t[or] = i ? n.display : "", t[dc] && (n.display = "none"));
}
const is = /\s*!important$/;
function Le(t, e, s) {
  if (j(s))
    s.forEach((n) => Le(t, e, n));
  else if (s == null && (s = ""), e.startsWith("--"))
    is.test(s) ? t.setProperty(e, s.replace(is, ""), "important") : t.setProperty(e, s);
  else {
    const n = _c(t, e);
    is.test(s) ? t.setProperty(
      re(n),
      s.replace(is, ""),
      "important"
    ) : t[n] = s;
  }
}
const cr = ["Webkit", "Moz", "ms"], Bs = {};
function _c(t, e) {
  const s = Bs[e];
  if (s)
    return s;
  let n = Pt(e);
  if (n !== "filter" && n in t)
    return Bs[e] = n;
  n = br(n);
  for (let r = 0; r < cr.length; r++) {
    const i = cr[r] + n;
    if (i in t)
      return Bs[e] = i;
  }
  return e;
}
function mc(t, e, s, n) {
  return t.tagName === "TEXTAREA" && (e === "width" || e === "height") && st(n) && s === n;
}
const fr = "http://www.w3.org/1999/xlink";
function ar(t, e, s, n, r, i = ki(e)) {
  n && e.startsWith("xlink:") ? s == null ? t.removeAttributeNS(fr, e.slice(6, e.length)) : t.setAttributeNS(fr, e, s) : s == null || i && !Es(s) ? t.removeAttribute(e) : t.setAttribute(
    e,
    i ? "" : se(s) ? String(s) : s
  );
}
function ur(t, e, s, n, r) {
  if (e === "innerHTML" || e === "textContent") {
    s != null && (t[e] = e === "innerHTML" ? wi(s) : s);
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
function bc(t, e, s, n) {
  t.addEventListener(e, s, n);
}
function yc(t, e, s, n) {
  t.removeEventListener(e, s, n);
}
const dr = /* @__PURE__ */ Symbol("_vei");
function xc(t, e, s, n, r = null) {
  const i = t[dr] || (t[dr] = {}), l = i[e];
  if (n && l)
    l.value = n;
  else {
    const [o, f] = Ec(e);
    if (n) {
      const d = i[e] = Ac(
        n,
        r
      );
      bc(t, o, d, f);
    } else l && (yc(t, o, l, f), i[e] = void 0);
  }
}
const vc = /(Once|Passive|Capture)$/, Tc = /^on:?(?:Once|Passive|Capture)$/;
function Ec(t) {
  let e, s;
  for (; (s = t.match(vc)) && !Tc.test(t); )
    e || (e = {}), t = t.slice(0, t.length - s[1].length), e[s[1].toLowerCase()] = !0;
  return [t[2] === ":" ? t.slice(3) : re(t.slice(2)), e];
}
let Ws = 0;
const wc = /* @__PURE__ */ Promise.resolve(), Sc = () => Ws || (wc.then(() => Ws = 0), Ws = Date.now());
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
        const d = l[f];
        d && Rt(
          d,
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
  e === "class" ? uc(t, n, l) : e === "style" ? gc(t, s, n) : Ge(e) ? ys(e) || xc(t, e, s, n, i) : (e[0] === "." ? (e = e.slice(1), !0) : e[0] === "^" ? (e = e.slice(1), !1) : Cc(t, e, n, l)) ? (ur(t, e, n), !t.tagName.includes("-") && (e === "value" || e === "checked" || e === "selected") && ar(t, e, n, l, i, e !== "value")) : /* #11081 force set props for possible async custom element */ t._isVueCE && // #12408 check if it's declared prop or it's async custom element
  (Pc(t, e) || // @ts-expect-error _def is private
  t._def.__asyncLoader && (/[A-Z]/.test(e) || !st(n))) ? ur(t, Pt(e), n, i, e) : (e === "true-value" ? t._trueValue = n : e === "false-value" && (t._falseValue = n), ar(t, e, n, l));
};
function Cc(t, e, s, n) {
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
function Pc(t, e) {
  const s = (
    // @ts-expect-error _def is private
    t._def.props
  );
  if (!s)
    return !1;
  const n = Pt(e);
  return Array.isArray(s) ? s.some((r) => Pt(r) === n) : Object.keys(s).some((r) => Pt(r) === n);
}
const Si = /* @__PURE__ */ pt({ patchProp: Oc }, fc);
let ke, pr = !1;
function Mc() {
  return ke || (ke = $o(Si));
}
function Ic() {
  return ke = pr ? ke : jo(Si), pr = !0, ke;
}
const Rc = (...t) => {
  const e = Mc().createApp(...t), { mount: s } = e;
  return e.mount = (n) => {
    const r = Oi(n);
    if (!r) return;
    const i = e._component;
    !$(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = "");
    const l = s(r, !1, Ai(r));
    return r instanceof Element && (r.removeAttribute("v-cloak"), r.setAttribute("data-v-app", "")), l;
  }, e;
}, Dc = (...t) => {
  const e = Ic().createApp(...t), { mount: s } = e;
  return e.mount = (n) => {
    const r = Oi(n);
    if (r)
      return s(r, !0, Ai(r));
  }, e;
};
function Ai(t) {
  if (t instanceof SVGElement)
    return "svg";
  if (typeof MathMLElement == "function" && t instanceof MathMLElement)
    return "mathml";
}
function Oi(t) {
  return st(t) ? document.querySelector(t) : t;
}
function Hc(t) {
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
        const o = i.dataset.txSsr === "1" ? Dc(s) : Rc(s);
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
const gr = "https://github.com/YvYuYv/taixu", fn = "vite", qt = { ctx: null }, Lc = /* @__PURE__ */ zl({
  name: "ViteRoot",
  setup() {
    const t = /* @__PURE__ */ Zs("home");
    qt.setPage = (n) => t.value = n;
    const e = [
      ["home", "首页"],
      ["dialog", "弹窗"],
      ["location", "路由"],
      ["contact", "通信"]
    ], s = (n) => {
      t.value = n, qt.ctx?.bus.broadcast(qt.ctx, { type: "sub-route-change", payload: { name: fn, path: `/${n}` } });
    };
    return () => S("div", null, [
      S(
        "nav",
        { class: "txvt-nav" },
        e.map(
          ([n, r]) => S("button", { class: t.value === n ? "on" : "", onClick: () => s(n) }, r)
        )
      ),
      S("div", { class: "txvt-page" }, [
        t.value === "home" && S(Vc),
        t.value === "dialog" && S(Nc),
        t.value === "location" && S(Uc),
        t.value === "contact" && S(Fc)
      ])
    ]);
  }
}), Vc = {
  setup() {
    return () => S("div", null, [
      S("h2", null, "vite 示例"),
      S("p", null, [
        "当前 vite 版本 ",
        S("b", null, "5.4.21"),
        "，当前 vue 版本 ",
        S("b", null, on),
        "（本子应用由 Vite lib mode 独立构建——构建工具差异化；产物与 esbuild 子应用同形态：自包含 ESM，default export = taixu Plugin）。"
      ]),
      S(
        "p",
        null,
        "官方示例 UI 库：element-plus 版本 2.2.6 / ant-design-vue 版本 2.2.8 —— 本示例以零依赖等价实现替代，避免为演示引入大型 UI 依赖。"
      ),
      S("p", null, ["仓库地址：", S("a", { href: gr, target: "_blank", rel: "noreferrer" }, gr)]),
      S("p", null, "页面目录：弹窗 / 路由 / 通信。")
    ]);
  }
}, Nc = {
  setup() {
    const t = /* @__PURE__ */ Zs(!1), e = /* @__PURE__ */ Zs(!1);
    let s = null;
    const n = () => {
      s?.remove(), s = null;
    }, r = () => {
      s || (s = document.createElement("div"), s.className = "txvt-overlay", s.innerHTML = '<div class="txvt-modal"><h3>手动插入的弹层</h3><p>由子应用 document.createElement + document.body.appendChild 生成，不经任何框架 API。</p><div style="text-align:right;margin-top:14px"><button class="txvt-btn txvt-remove">删除</button></div></div>', document.body.appendChild(s), s.querySelector(".txvt-remove")?.addEventListener("click", n), s.addEventListener("click", (i) => {
        i.target === s && n();
      }));
    };
    return Xr(n), () => S("div", null, [
      S("h2", null, "弹窗处理"),
      S("p", null, "弹窗无需子应用做任何处理就可使用（Teleport 挂 body）。"),
      S("h3", null, "1. 打开弹窗"),
      S("button", { class: "txvt-btn", onClick: () => t.value = !0 }, "Open Modal"),
      S("h3", null, "2. 下拉选择器"),
      S(
        "select",
        { class: "txvt-select" },
        ["Jack", "Lucy", "Tom"].map((i) => S("option", { key: i }, i))
      ),
      S("h3", null, "3. 气泡卡片（悬停）"),
      S(
        "span",
        {
          class: "txvt-pop",
          onMouseenter: () => e.value = !0,
          onMouseleave: () => e.value = !1
        },
        [
          S("button", { class: "txvt-btn", style: { background: "#5a67d8" } }, "Hover me"),
          e.value && S("span", { class: "txvt-pop-body" }, [S("div", null, "Content"), S("div", null, "Content")])
        ]
      ),
      S("h3", null, "4. 手动向 body 中 append 弹层"),
      S("button", { class: "txvt-btn", onClick: r }, "点击插入 body"),
      S("button", { class: "txvt-btn warn", onClick: n }, "点击删除 body"),
      t.value && S(Yl, { to: "body" }, [
        S(
          "div",
          { class: "txvt-overlay", onClick: () => t.value = !1 },
          S(
            "div",
            { class: "txvt-modal", onClick: (i) => i.stopPropagation() },
            [
              S("h3", null, "Basic Modal"),
              S("p", null, "弹窗内容（渲染在 body 下）"),
              S("div", { style: { textAlign: "right", marginTop: "14px" } }, [
                S("button", { class: "txvt-btn", onClick: () => t.value = !1 }, "OK")
              ])
            ]
          )
        )
      ])
    ]);
  }
}, Uc = {
  setup() {
    const t = window.location.host;
    return () => S("div", null, [
      S("h2", null, "location 处理"),
      S("p", null, [
        "官方 vite 示例因 ",
        S("code", null, '<script type="module">'),
        " 无法用闭包劫持 location，需把代理挂到 ",
        S("code", null, "$wujie.location"),
        "，子应用所有用到 ",
        S("code", null, "window.location"),
        " 的代码都要改写成 ",
        S("code", null, "$wujie.location"),
        "；taixu 子应用与宿主同文档渲染，location 直读真实地址，无需任何改写。"
      ]),
      S("h3", null, "1. 路由同步"),
      S("p", null, [
        "子应用页面变化经 bus 消息 ",
        S("code", null, "sub-route-change"),
        " 通知宿主，宿主路由跟随；宿主路由变化经定向消息 ",
        S("code", null, "vite-router-change"),
        " 下发——双向同步。浏览器的刷新、前进、后退都可以作用到子应用上。"
      ]),
      S("div", { class: "txvt-row" }, [
        S("button", { class: "txvt-btn", onClick: () => window.history.back() }, "后退一页"),
        S("button", { class: "txvt-btn", onClick: () => window.history.forward() }, "前进一页")
      ]),
      S("h3", null, "2. 获取 window.location.host 的值"),
      S("blockquote", null, S("b", null, t)),
      S("p", null, "taixu 子应用与宿主同文档，location 直读真实地址——无需劫持回填。"),
      S("h3", null, "3. 修改 window.location.href"),
      S(
        "button",
        { class: "txvt-btn warn", onClick: () => window.location.href = "https://github.com/taixu-micro" },
        "跳转 taixu 仓库"
      ),
      S("p", null, "同窗应用直接跳转，无 shadow 删除 / iframe 替换等降级动作。")
    ]);
  }
}, Fc = {
  setup() {
    return () => S("div", null, [
      S("h2", null, "通信处理"),
      S("p", null, "应用可以有三种方式进行通信（对应 wujie 的 props / window.parent / bus）："),
      S("h3", null, "1. 宿主注入的导航能力（= wujie props.jump）"),
      S("p", null, "子应用 broadcast 消息 navigate，宿主监听后跳转对应路由。"),
      S(
        "button",
        {
          class: "txvt-btn",
          onClick: () => qt.ctx?.bus.broadcast(qt.ctx, { type: "navigate", payload: { name: "react16" } })
        },
        "点击跳转 react16"
      ),
      S("h3", null, "2. 调用宿主全局方法（= wujie window.parent.alert）"),
      S("p", null, "taixu 子应用与宿主同窗运行——直接调用 window.alert，无需 window.parent 中转。"),
      S("button", { class: "txvt-btn", onClick: () => window.alert("子应用直接调用 window.alert") }, "显示 alert"),
      S("h3", null, "3. bus 去中心化事件（= wujie bus.$emit）"),
      S("p", null, "子应用 broadcast click 事件，宿主全局旁听后 alert。"),
      S(
        "button",
        {
          class: "txvt-btn",
          onClick: () => qt.ctx?.bus.broadcast(qt.ctx, { type: "click", payload: "vite" })
        },
        "显示 alert（bus）"
      )
    ]);
  }
}, jc = {
  name: fn,
  inject: ["lifecycle", "bus", "monitor", "style"],
  apply(t) {
    t.style.inject(t, { file: "vite.css", css: $c }), qt.ctx = t, t.on("message/receive", (e) => {
      const s = e.message;
      s?.type === "vite-router-change" && s.payload?.path && qt.setPage?.(String(s.payload.path).replace(/^\//, "") || "home");
    }), Hc({ appId: fn, rootComponent: Lc }).apply(t);
  }
}, $c = `
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
.txvt-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:6px 0; }
.txvt-page code { background:#f2f4f8; border-radius:4px; padding:1px 5px; font-size:13px; color:#c7254e; }
.txvt-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txvt-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
.txvt-pop { position:relative; display:inline-block; }
.txvt-pop-body { position:absolute; top:110%; left:0; background:#fff; border:1px solid #e5e8f0; box-shadow:0 4px 14px rgba(0,0,0,.12); border-radius:8px; padding:10px 14px; width:220px; z-index:50; }
`;
export {
  jc as default
};
