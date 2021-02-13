import * as visit from 'unist-util-visit';
import {Code, Parent} from 'mdast';
import {Node} from 'unist';
import {Options as PrettierOptions, format} from 'prettier';
import {Transformer} from 'unified';
import {transformSync} from '@babel/core';

function insertAt(
  array: Parent['children'],
  index: number,
  item: Code
): Parent['children'] {
  return [...array.slice(0, index), item, ...array.slice(index)];
}

function isReactComponent(node: Node, tagRegex: RegExp): boolean {
  return node && node.type === 'jsx' && tagRegex.test(node.value as string);
}

const PRESERVE_COMMENT = '// preserve-line';
const PRESERVE_PATTERN = new RegExp(`\\s${PRESERVE_COMMENT}$`);

function removePreserveComment(line: string): string {
  return line.replace(PRESERVE_PATTERN, '');
}

interface Options {
  wrapperComponent?: string;
  prettierOptions?: PrettierOptions;
}

export = function remarkTypescript({
  wrapperComponent,
  prettierOptions = {}
}: Options = {}): Transformer {
  const openingTagRegex = new RegExp(`<${wrapperComponent}[^>]*>`);
  const closingTagRegex = new RegExp(`</${wrapperComponent}>`);

  return function transformer(tree): void {
    function visitor(node: Code, index: number, parent: Parent): void {
      if (/^tsx?/.test(node.lang)) {
        const prevNode = parent.children[index - 1];
        const nextNode = parent.children[index + 1];

        if (wrapperComponent) {
          const isWrapped =
            isReactComponent(prevNode, openingTagRegex) &&
            isReactComponent(nextNode, closingTagRegex);
          if (!isWrapped) {
            return;
          }
        }

        try {
          const lines = node.value.split('\n');
          const {code} = transformSync(
            lines
              .map((line: string): string =>
                PRESERVE_PATTERN.test(line) ? '// ' + line : line
              )
              .join('\n'),
            {
              filename: `file.${node.lang}`,
              retainLines: true,
              presets: ['@babel/typescript']
            }
          );

          if (code.trim()) {
            parent.children = insertAt(parent.children, index + 1, {
              type: 'code',
              lang: node.lang.replace(/^ts|(?<=\.)ts/g, 'js'),
              value: format(
                code
                  .split('\n')
                  .map((line: string): string =>
                    PRESERVE_PATTERN.test(line)
                      ? removePreserveComment(line.replace(/^\/\/\s/, ''))
                      : line
                  )
                  .join('\n'),
                {
                  ...prettierOptions,
                  parser: 'babel'
                }
              ).trim()
            });
          }

          node.value = lines.map(removePreserveComment).join('\n');
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(error.message);
        }
      }
    }

    visit(tree, 'code', visitor);
  };
};
