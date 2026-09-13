import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const {companyFeedAuthor}=createRequire(import.meta.url)('../lib/marketIntelLinks.ts');
const company={name:'Example Pharma',company_url:'https://www.linkedin.com/company/example-pharma/posts',logo_url:'https://example.org/logo.png'};
test('company identity skips reshared people and other companies without removing posts',()=>{
 const items=[{author:{name:'CEO',company_url:'https://www.linkedin.com/in/ceo'}},{author:{name:'Other',company_url:'https://www.linkedin.com/company/other'}},{author:company}];
 assert.equal(companyFeedAuthor(items,'example-pharma'),company);
 assert.equal(items.length,3);
});
test('a feed of only reshares does not claim the original author is the company',()=>{
 assert.equal(companyFeedAuthor([{author:{name:'CEO',company_url:'https://www.linkedin.com/in/ceo'},source_company:'linkedin.com/company/example-pharma'}],'example-pharma'),null);
 assert.equal(companyFeedAuthor([{author:{name:'Other',company_url:'https://www.linkedin.com/company/other'}}],'example-pharma'),null);
});
