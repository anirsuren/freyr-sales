import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react');
// The renderer moved out of AgentChat on Sep 25 (shared by the full chat and
// the dock); slicing the old file found nothing and the test failed to load.
const source=readFileSync(new URL('../components/agent/AgentResponseMarkdown.tsx',import.meta.url),'utf8');
const part=source.slice(source.indexOf('function renderInline('),source.indexOf('\nexport function AgentResponseMarkdown('));
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
 // The shared renderer is the former MarkdownText; it runs to the end of
 // the file, and every imported helper is stubbed the way renderInline's are.
 const part=source.slice(source.indexOf('export function AgentResponseMarkdown(')).replace(/^export /,'');
 const js=ts.transpileModule(part,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 const MarkdownText=new Function('React','normalizeAgentLinks','entitiesForAnswer','renderInline','Link','CompanyLogo','Avatar','ChatChart','parseChartSpec','APP_ROUTES','readableLinkLabel','injectEntities','entityLink',js+';return AgentResponseMarkdown;')(React,x=>x,(_x,e)=>e,x=>[x],'a',()=>null,()=>null,()=>null,()=>null,new Set(),x=>x,text=>[text],()=>null);
 const result=MarkdownText({text:'| Date | Source |\n| --- | --- |\n| Today | Publisher\n| Yesterday | Other publisher'});
 const table=result.props.children[0].props.children;
 assert.equal(table.type,'table');assert.equal(table.props.children[1].props.children.length,2);
});
