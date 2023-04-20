/* eslint-disable max-len */
import terser from '@rollup/plugin-terser'
import banner2 from 'rollup-plugin-banner2'
import json from '@rollup/plugin-json'
import copy from 'rollup-plugin-copy'
import typescript from 'rollup-plugin-typescript2'
import clear from 'rollup-plugin-clear'
const pkg = require('./package.json')

export default [
  {
    input: './src/index.ts',
    external: ['@holyhigh/func.js'],
    plugins: [
      clear({
        targets: ['dist'],
      }),
      typescript({
        clean: true
      }),
      terser(),
      banner2(
        () => `/**
   * ${pkg.name} v${pkg.version}
   * ${pkg.description}
   * @${pkg.author}
   * ${pkg.repository.url}
   */
  `
      ),
      json(),
      copy({
        targets: [
          {
            src: [
              'CHANGELOG.md',
              'LICENSE',
              'README.md',
              'package.json',
              '.npmignore',
            ],
            dest: 'dist',
          },
        ],
      }),
    ],
    output: [
      {
        file: 'dist/index.js',
        format: 'esm'
      },
    ],
  }
]