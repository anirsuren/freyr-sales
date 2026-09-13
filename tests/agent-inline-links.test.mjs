import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react');
const source=readFileSync(new URL('../components/agent/AgentChat.tsx',import.meta.url),'utf8');
const part=source.slice(source.indexOf('function renderInline('),source.indexOf('\ntype ChartSpec'));
const js=ts.transpileModule(part,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
const renderInline=new Function('React','Link','injectEntities','entityLink','readableLinkLabel','APP_ROUTES',js+';return renderInline;')(React,'a',text=>[text],()=>null,text=>text,new Set(['offerings']));
test('bold and italic markdown preserve nested readable links without exposing raw paths',()=>{
 for(const mark of ['**','__','*','_']){
 const result=renderInline(mark+'[Publishing](/offerings/of-015)'+mark,'test');
 const link=result[0].props.children[0];
 assert.equal(link.props.href,'/offerings/of-015');
 assert.equal(link.props.children,'Publishing');
 }
});
test('bold external citation stays an external labelled link',()=>{
 const result=renderInline('**[Original article](https://example.test/article)**','test');
 const link=result[0].props.children[0];
 assert.equal(link.props.href,'https://example.test/article');assert.equal(link.props.children,'Original article');assert.equal(link.props.rel,'noopener noreferrer');
});
test('Markdown table rows do not require an optional trailing pipe',()=>{
 const part=source.slice(source.indexOf('function MarkdownText('),source.indexOf('\nfunction ThinkingDots'));
 const js=ts.transpileModule(part,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 const MarkdownText=new Function('React','normalizeAgentLinks','entitiesForAnswer','renderInline',js+';return MarkdownText;')(React,x=>x,(_x,e)=>e,x=>[x]);
 const result=MarkdownText({text:'| Date | Source |\n| --- | --- |\n| Today | Publisher\n| Yesterday | Other publisher'});
 const table=result.props.children[0].props.children;
 assert.equal(table.type,'table');assert.equal(table.props.children[1].props.children.length,2);
});
