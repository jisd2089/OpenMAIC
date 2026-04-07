export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'python'
  | 'java'
  | 'c'
  | 'cpp'
  | 'go'
  | 'rust'
  | 'shell'
  | 'php'
  | 'ruby'
  | 'csharp'
  | 'kotlin'
  | 'swift'
  | 'scala';

export type CodePreviewMode = 'terminal' | 'web' | 'artifact';

export interface CodeLanguageCatalogEntry {
  language: CodeLanguage;
  label: string;
  defaultFileName: string;
  previewMode: CodePreviewMode;
  defaultContent: string;
}

export const CODE_LANGUAGE_CATALOG: CodeLanguageCatalogEntry[] = [
  {
    language: 'javascript',
    label: 'JavaScript',
    defaultFileName: 'index.js',
    previewMode: 'terminal',
    defaultContent: "console.log('Hello from iotek');\n",
  },
  {
    language: 'typescript',
    label: 'TypeScript',
    defaultFileName: 'index.ts',
    previewMode: 'terminal',
    defaultContent: "const message: string = 'Hello from iotek';\nconsole.log(message);\n",
  },
  {
    language: 'html',
    label: 'HTML / CSS / JS',
    defaultFileName: 'index.html',
    previewMode: 'web',
    defaultContent: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>iotek Preview</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #f8fafc, #dbeafe);
        color: #0f172a;
        font-family: 'Georgia', serif;
      }

      main {
        width: min(680px, calc(100vw - 32px));
        padding: 32px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Hello from iotek</h1>
      <p>Edit this file and click Run to preview your scene.</p>
    </main>
  </body>
</html>
`,
  },
  {
    language: 'python',
    label: 'Python',
    defaultFileName: 'main.py',
    previewMode: 'terminal',
    defaultContent: "print('Hello from iotek')\n",
  },
  {
    language: 'java',
    label: 'Java',
    defaultFileName: 'Main.java',
    previewMode: 'terminal',
    defaultContent:
      'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from iotek");\n  }\n}\n',
  },
  {
    language: 'c',
    label: 'C',
    defaultFileName: 'main.c',
    previewMode: 'terminal',
    defaultContent:
      '#include <stdio.h>\n\nint main(void) {\n  printf("Hello from iotek\\n");\n  return 0;\n}\n',
  },
  {
    language: 'cpp',
    label: 'C++',
    defaultFileName: 'main.cpp',
    previewMode: 'terminal',
    defaultContent:
      '#include <iostream>\n\nint main() {\n  std::cout << "Hello from iotek" << std::endl;\n  return 0;\n}\n',
  },
  {
    language: 'go',
    label: 'Go',
    defaultFileName: 'main.go',
    previewMode: 'terminal',
    defaultContent:
      'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello from iotek")\n}\n',
  },
  {
    language: 'rust',
    label: 'Rust',
    defaultFileName: 'main.rs',
    previewMode: 'terminal',
    defaultContent: 'fn main() {\n    println!("Hello from iotek");\n}\n',
  },
  {
    language: 'shell',
    label: 'Shell',
    defaultFileName: 'script.sh',
    previewMode: 'terminal',
    defaultContent: "echo 'Hello from iotek'\n",
  },
  {
    language: 'php',
    label: 'PHP',
    defaultFileName: 'index.php',
    previewMode: 'terminal',
    defaultContent: "<?php\necho \"Hello from iotek\\n\";\n",
  },
  {
    language: 'ruby',
    label: 'Ruby',
    defaultFileName: 'main.rb',
    previewMode: 'terminal',
    defaultContent: "puts 'Hello from iotek'\n",
  },
  {
    language: 'csharp',
    label: 'C#',
    defaultFileName: 'Program.cs',
    previewMode: 'terminal',
    defaultContent:
      'using System;\n\nclass Program {\n  static void Main() {\n    Console.WriteLine("Hello from iotek");\n  }\n}\n',
  },
  {
    language: 'kotlin',
    label: 'Kotlin',
    defaultFileName: 'Main.kt',
    previewMode: 'terminal',
    defaultContent: 'fun main() {\n    println("Hello from iotek")\n}\n',
  },
  {
    language: 'swift',
    label: 'Swift',
    defaultFileName: 'main.swift',
    previewMode: 'terminal',
    defaultContent: 'print("Hello from iotek")\n',
  },
  {
    language: 'scala',
    label: 'Scala',
    defaultFileName: 'Main.scala',
    previewMode: 'terminal',
    defaultContent: 'object Main extends App {\n  println("Hello from iotek")\n}\n',
  },
];

export function getCodeLanguageCatalogEntry(language: CodeLanguage): CodeLanguageCatalogEntry {
  return (
    CODE_LANGUAGE_CATALOG.find((entry) => entry.language === language) ??
    CODE_LANGUAGE_CATALOG[0]
  );
}

export function createDefaultCodeFiles(language: CodeLanguage): Array<{ path: string; content: string }> {
  const entry = getCodeLanguageCatalogEntry(language);
  return [
    {
      path: entry.defaultFileName,
      content: entry.defaultContent,
    },
  ];
}
