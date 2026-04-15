import docx
import os
import sys

doc_path = r"c:\CLG\cobbleAI\cobble_ai_plan_v2 (1).docx"
output_path = r"c:\CLG\cobbleAI\plan_text.txt"

if os.path.exists(doc_path):
    doc = docx.Document(doc_path)
    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(full_text))
    print(f"Plan extracted to {output_path}")
else:
    print(f"File not found: {doc_path}")
