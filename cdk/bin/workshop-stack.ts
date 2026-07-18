#!/usr/bin/env node

/**
 * CDK App Entry Point
 *
 * This is where we instantiate our CDK stack
 */

import dotenv from 'dotenv';
import path from 'path';
import * as cdk from 'aws-cdk-lib';
import { WorkshopStack } from '../lib/workshop-stack';

// Load .env from root directory (two levels up from cdk/bin)
// Note: __dirname is available in CommonJS (this package uses module: commonjs)
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = new cdk.App();

new WorkshopStack(app, 'WorkshopStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || 'test',
    region: process.env.AWS_REGION || 'eu-central-1',
  },
  description: 'AWS CDK & LocalStack Workshop Stack',
});

app.synth();
