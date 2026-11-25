'use strict';
// The QR on the CV paper and in the text download (spec 2026-11-25-yocv-qr-verify-design section 1).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildCv,renderCvHtml,buildCvText,cvFingerprint}=require('../core.js');
const {sampleState}=require('./helpers/cv-state.cjs');
const {qrSvg}=require('../server/qr.js');
const copy=require('../cv-copy.js').en;
const URL_='https://yocard.example/cv-check/0123456789abcdef';
const made=state=>({checkId:'0123456789abcdef',code:'0123-4567',url:URL_,qrSvg:qrSvg(URL_),expiresAt:'2027-02-14T14:40:12.000Z',fp:cvFingerprint(buildCv(state,copy))});

test('a QR made for this CV prints at the foot of the paper and in the text version',()=>{
  const state=sampleState();state.verify=made(state);
  const cv=buildCv(state,copy),html=renderCvHtml(cv,copy);
  assert.equal(cv.verify.url,URL_);
  const at=html.indexOf('class="cv-verify"');
  assert.ok(at>html.indexOf(copy.cvReferences),'after the references');
  assert.match(html,/<img class="cv-qr" src="data:image\/svg\+xml;charset=utf-8,%3Csvg[^"]*" alt="[^"]+"/);
  assert.ok(html.includes(copy.verifyScan)&&html.includes('Check code 0123-4567')&&html.includes(URL_));
  const text=buildCvText(cv,copy);
  assert.ok(text.includes(copy.verifyScan+': '+URL_)&&text.includes('Check code 0123-4567'));
});

test('a QR made before the CV changed is dropped, and a contact change keeps it',()=>{
  const state=sampleState();state.verify=made(state);
  state.contact.phone='+27 73 555 0000';
  assert.ok(buildCv(state,copy).verify,'contact is not in the check');
  state.contact.name=state.contact.name+' K';
  const cv=buildCv(state,copy);
  assert.equal(cv.verify,null);
  assert.ok(!renderCvHtml(cv,copy).includes('cv-verify')); assert.ok(!buildCvText(cv,copy).includes(URL_));
});

test('only an https or http URL and a server QR svg are printed',()=>{
  const state=sampleState();
  state.verify={...made(state),url:'javascript:alert(1)'};
  assert.equal(buildCv(state,copy).verify,null);
  state.verify={...made(state),qrSvg:'<img src=x onerror=alert(1)>'};
  assert.equal(buildCv(state,copy).verify,null);
});
