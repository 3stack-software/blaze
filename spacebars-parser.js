import { HTMLTools } from './packages/html-tools/index.js';
import { TemplateTag } from './packages/spacebars-compiler/templatetag';


// only parses whats between <template> tags
//  need html-scanner to find the tags in the file.
export function parse(input){
 return HTMLTools.parseFragment(
    input,
    { getTemplateTag: TemplateTag.parseCompleteTag });
}

export { Visitor } from './packages/htmljs/visitors';
export { HTML } from "./packages/htmljs";
export { HTMLTools } from "./packages/html-tools";
