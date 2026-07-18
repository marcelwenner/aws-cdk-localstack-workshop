# Infrastructure Layer - Dependency Injection

Diese Architektur nutzt **Dependency Injection** um Validators testbar zu machen.

## Problem vorher

```typescript
// ❌ Hardcoded AWS Clients in BaseValidator
class BaseValidator {
  constructor() {
    this.lambdaClient = new LambdaClient({ ... });
    this.sqsClient = new SQSClient({ ... });
  }
}

// ❌ Schwer zu testen - echte AWS Calls!
const validator = new Phase3Validator();
await validator.validate(); // Ruft echte AWS APIs auf
```

## Lösung jetzt

```typescript
// ✅ Interface für Infrastructure
interface IInfrastructure {
  invokeLambda(functionName, payload): Promise<...>
  getQueueUrl(queueName): Promise<string>
  receiveMessages(queueUrl, max): Promise<any[]>
  purgeQueue(queueUrl): Promise<void>
}

// ✅ Echte Implementierung (Production)
class AwsInfrastructure implements IInfrastructure {
  // Nutzt echte AWS SDK Clients
}

// ✅ Mock Implementierung (Tests)
class MockInfrastructure implements IInfrastructure {
  // Gibt vordefinierte Antworten zurück
}

// ✅ BaseValidator akzeptiert DI
class BaseValidator {
  constructor(infrastructure?: IInfrastructure) {
    this.infrastructure = infrastructure || new AwsInfrastructure();
  }
}
```

## Verwendung in Production

```typescript
// Ohne Parameter = Standard AwsInfrastructure
const validator = getValidator(3);
await validator.validate(); // Echte AWS Calls
```

## Verwendung in Tests

```typescript
import { MockInfrastructure } from '../infrastructure';
import Phase3Validator from './phase3.validator';

// Mock konfigurieren
const mock = new MockInfrastructure();
mock.setLambdaResponse('LtsExecutorLambda', {
  success: true,
  result: { status: 'completed' }
});
mock.setQueueUrl('lts-worker-queue', 'https://mock-url');

// Validator mit Mock erstellen
const validator = new Phase3Validator(mock);
const result = await validator.validate();

// ✅ Keine echten AWS Calls!
expect(result.passed).toBe(true);
```

Der Gewinn: Validator-Tests laufen ohne AWS-Infrastruktur in Millisekunden,
Szenarien sind deterministisch steuerbar, und der Produktionscode bleibt
unverändert (kein Parameter = echte AwsInfrastructure).

## Dateien

Es gibt zwei parallele Ausprägungen desselben Musters:

- `infrastructure.interface.ts` / `aws-infrastructure.ts` /
  `mock-infrastructure.ts` - das ursprüngliche Interface-Set,
  verwendet von `base.validator.ts` (und damit den Phase-Validatoren)
- `infrastructure.port.ts` / `aws-infrastructure.port.ts` /
  `mock-infrastructure.port.ts` - das schmalere Port-Set,
  verwendet vom `multi-layer.validator.ts`
- `index.ts` - Exports

Wer einen neuen Validator schreibt, nimmt das Set, das sein
Basis-Validator bereits benutzt.

## Neue Validators schreiben

```typescript
import { BaseValidator } from './base.validator';

export default class MyValidator extends BaseValidator {
  async validate(): Promise<{ passed: boolean; hints?: string[] }> {
    // Infrastructure ist bereits injected!
    const { success } = await this.invokeLambda('MyLambda', { ... });

    if (!success) {
      return { passed: false, hints: ['Lambda failed'] };
    }

    return { passed: true };
  }
}
```

## Tests schreiben

```typescript
import { describe, it, expect } from 'vitest';
import MyValidator from './my.validator';
import { MockInfrastructure } from '../infrastructure';

describe('MyValidator', () => {
  it('should pass when Lambda succeeds', async () => {
    const mock = new MockInfrastructure();
    mock.setLambdaResponse('MyLambda', { success: true });

    const validator = new MyValidator(mock);
    const result = await validator.validate();

    expect(result.passed).toBe(true);
  });
});
```
