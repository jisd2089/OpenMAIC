# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{teacherContext}}

## Available Resources

- **Available Media**: {{assignedImages}}
- **Canvas Size**: {{canvas_width}} x {{canvas_height}} px

## Output Requirements

Based on the scene information above, generate a complete Canvas/PPT component for one page.

**Language Requirement**: All generated text content must be in the same language as the title and description above.

**Must Follow**:

1. Output pure JSON directly, without any explanation or description
2. Do not wrap with ```json code blocks
3. Do not add any text before or after the JSON
4. Ensure the JSON format is correct and can be parsed directly
5. Use the provided media identifiers exactly as given
6. For video elements, only use explicitly provided generated video IDs or `knowledge://fileId` references
7. All TextElement `height` values must be selected from the quick reference table in the system prompt
8. If you output a bullet list, use `<ul>/<ol>/<li>` only. Do not fake bullets with `•`, `-`, or `1.` inside `<p>`

**Output Structure Example**:
{"background":{"type":"solid","color":"#ffffff"},"elements":[{"id":"title_001","type":"text","left":60,"top":50,"width":880,"height":76,"content":"<p style=\"font-size:32px;\"><strong>Title Content</strong></p>","defaultFontName":"","defaultColor":"#333333"},{"id":"content_001","type":"text","left":60,"top":150,"width":880,"height":130,"content":"<ul><li><span style=\"font-size:18px;\">Point One</span></li><li><span style=\"font-size:18px;\">Point Two</span></li><li><span style=\"font-size:18px;\">Point Three</span></li></ul>","defaultFontName":"","defaultColor":"#333333"}]}
