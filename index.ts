#!/usr/bin/env node
import {program} from 'commander';
import pkg from './package.json';
import controls from './src/controls';

program.version(pkg.version);

program
    //.command('cycle [offset]')
    .description('list issues for the current or future cycle')
    .action(async () => {
        await controls();
    });

program.on('--help', () => {
    console.log('');
    console.log('Examples:');
    console.log('  $ linear cycle');
    console.log('  $ linear cycle +1');
});

program.parse(process.argv);
