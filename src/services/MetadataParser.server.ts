/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Book } from '../types';
import fs from 'fs';
// @ts-ignore
import EPub from 'epub';

export async function getMetadataFromFile(filePath: string): Promise<Partial<Book>> {
  if (filePath.toLowerCase().endsWith('.epub')) {
    return new Promise((resolve) => {
      try {
        const epub = new EPub(filePath) as any;
        epub.on('end', () => {
          resolve({
            title: epub.metadata.title,
            author: epub.metadata.creator,
            description: epub.metadata.description,
          });
        });
        epub.on('error', () => {
          resolve({});
        });
        epub.parse();
      } catch (e) {
        resolve({});
      }
    });
  }
  return {};
}
