/**
 * Phase 0 Validator
 *
 * 1. Checks if CDK stack is deployed
 * 2. If not: Runs Setup Wizard (auto bootstrap + deploy)
 * 3. If yes: Offers optional re-deploy
 * 4. Optionally runs CDK tutorial
 * 5. Marks phase 0 as completed
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { Lambda } from '@aws-sdk/client-lambda';
import { SetupWizard } from '../wizards/setup-wizard.js';
import { StateManager } from '../state/workshop-state.js';
import { workshopConfig } from '../config/workshop.config.js';

export default class Phase0Validator {
  private stateManager = new StateManager();
  private lambda: Lambda;

  constructor() {
    this.lambda = new Lambda({
      region: workshopConfig.aws.region,
      endpoint: workshopConfig.aws.endpoint,
      credentials: workshopConfig.aws.credentials,
    });
  }

  async validate(): Promise<{ passed: boolean; hints?: string[] }> {
    // Step 1: Check if stack is deployed
    const isDeployed = await this.checkStackDeployed();

    if (!isDeployed) {
      // Stack missing - MUST run Setup Wizard
      console.log(chalk.yellow('\n⚠️  CDK Stack noch nicht deployed.\n'));

      const { runSetup } = await inquirer.prompt([{
        type: 'confirm',
        name: 'runSetup',
        message: chalk.cyan('Setup Wizard starten? (Bootstrap + Deploy automatisch)'),
        default: true,
      }]);

      if (!runSetup) {
        return {
          passed: false,
          hints: ['Stack muss deployed sein. Führe den Setup Wizard aus.'],
        };
      }

      const success = await this.runSetupWizard();
      if (!success) {
        return {
          passed: false,
          hints: ['Setup fehlgeschlagen. Bitte prüfe die Logs.'],
        };
      }
    } else {
      // Stack exists - offer optional re-deploy
      console.log(chalk.green('\n✅ CDK Stack bereits deployed.\n'));

      const { redeploy } = await inquirer.prompt([{
        type: 'confirm',
        name: 'redeploy',
        message: chalk.cyan('Stack existiert. Neu deployen? (bei Änderungen am Stack)'),
        default: false,
      }]);

      if (redeploy) {
        const success = await this.runSetupWizard();
        if (!success) {
          console.log(chalk.yellow('\n⚠️  Re-Deploy fehlgeschlagen, aber alter Stack funktioniert noch.\n'));
        }
      }
    }

    // Step 2: Hinweis auf Tutorial (jetzt in Ink verfügbar)
    console.log(chalk.cyan('\n💡 Tipp: Drücke [T] für das CDK Tutorial in der App!\n'));

    // Step 3: Mark phase 0 as completed
    await this.stateManager.markPhaseComplete(0);

    console.log(chalk.green('\n✅ Phase 0 abgeschlossen! Weiter zu Phase 1.\n'));

    return { passed: true };
  }

  private async runSetupWizard(): Promise<boolean> {
    const wizard = new SetupWizard();
    return wizard.run();
  }

  private async checkStackDeployed(): Promise<boolean> {
    try {
      await this.lambda.getFunction({
        FunctionName: workshopConfig.lambdas.GetTableList,
      });
      return true;
    } catch {
      return false;
    }
  }
}
