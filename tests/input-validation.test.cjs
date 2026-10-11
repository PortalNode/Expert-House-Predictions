const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseEntryNumber}=require('../assets/entry-number.js');

test('financial inputs preserve zero, negatives, Arabic digits, decimals and grouping',()=>{
  for(const [input,expected] of [['0',0],['.5',.5],['1.',1],['-25.5',-25.5],['١٬٢٣٤٫٥',1234.5],['(١٬٢٣٤٫٥)',-1234.5],['۱۲۰٫۵',120.5],['1,234,567.89',1234567.89],[' +20 ',20]]) assert.equal(parseEntryNumber(input),expected,input);
});
test('missing, partial and malformed values cannot silently become a financial value',()=>{
  for(const input of ['',null,undefined,'  ','abc','12abc','1,2','1.2.3','Infinity','--2','()','١٢ ريال']) assert.equal(parseEntryNumber(input),null,String(input));
});
// Exercise the real review commit boundary: an invalid selected row must block the whole save.
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const commit=html.slice(html.indexOf('function commitAIReview('),html.indexOf('async function parseWithAI(){'));
function field(value){return {value,attributes:{},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]},focus(){this.focused=true}}}
function reviewRow(value,checked=true){const company=field('الراجحي'),amount=field(value),expert=field('الراجحي المالية');return {company,amount,querySelectorAll(){return []},querySelector(selector){return {'.review-use':{checked},'.review-company':company,'.review-value':amount,'.review-expert':expert}[selector]}}}
function run(rows){const calls=[];const context={parseEntryNumber,canonicalCompany:s=>s,EXPERTS:['الراجحي المالية'],document:{querySelectorAll:()=>rows},showToast:msg=>calls.push({error:msg}),applyItems:items=>calls.push({items})};vm.createContext(context);vm.runInContext(commit+'\ncommitAIReview("2026","q3");',context);return calls;}
test('one blank selected amount blocks every row and focuses the invalid field',()=>{const blank=reviewRow('');const calls=run([reviewRow('200'),blank]);assert.equal(calls.filter(x=>x.items).length,0);assert.equal(blank.amount.attributes['aria-invalid'],'true');assert.equal(blank.amount.focused,true)});
test('an explicitly entered zero is saved, while unchecked blanks are ignored',()=>{const calls=run([reviewRow('0'),reviewRow('',false)]);assert.equal(calls[0].items.length,1);assert.equal(calls[0].items[0].value,0)});
test('a missing company blocks save',()=>{const row=reviewRow('20');row.company.value=' ';assert.equal(run([row]).filter(x=>x.items).length,0);assert.equal(row.company.focused,true)});
