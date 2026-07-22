# Saga закрытия лота и сеттлмента

§7 ТЗ. Триггер — событие `lot.closed`. Оркестратор — [`settlement-step.consumer.ts`](../../apps/api/src/modules/settlement/application/settlement-step.consumer.ts), состояние шага/направления — [`saga.ts`](../../apps/api/src/modules/settlement/domain/saga.ts) (`STEP_ORDER`, `nextStep`/`previousStep`), персистится в `saga_instances`. Падение шага после N ретраев переключает саму сагу в `compensating` и запускает компенсацию **начиная с упавшего шага**, затем шаг за шагом назад до `lock`; `winner`/`notify`/`settle` компенсации не имеют (no-op — совпадает с §7, где для них стоит «—»).

```mermaid
flowchart TD
    Trigger(["lot.closed"]) --> S1["1. Lock<br/>distributed lock на лот"]
    S1 -->|ok| S2["2. Winner<br/>лучшая валидная ставка из БД"]
    S2 -->|ok| S3["3. Reserve<br/>резерв средств (эмуляция)"]
    S3 -->|ok| S4["4. Invoice<br/>сгенерировать инвойс"]
    S4 -->|ok| S5["5. Notify<br/>winner + shipper"]
    S5 -->|ok| S6["6. Settle<br/>lot.status = settled"]
    S6 --> Done(["settlement.completed"])

    S1 -.->|N ретраев исчерпаны| C1["Compensate 1: release lock"]
    S2 -.->|нет валидных ставок<br/>или N ретраев| C2["Compensate 2: — (no-op)"]
    S3 -.->|N ретраев исчерпаны| C3["Compensate 3: release funds"]
    S4 -.->|N ретраев исчерпаны| C4["Compensate 4: void invoice"]
    S5 -.->|N ретраев исчерпаны| C5["Compensate 5: — (no-op)"]
    S6 -.->|N ретраев исчерпаны| C6["Compensate 6: — (no-op)"]

    C6 --> C5 --> C4 --> C3 --> C2 --> C1
    C1 --> Failed(["settlement.failed<br/>lot.status = cancelled"])

    classDef compensate fill:#5a1f1f,stroke:#e06666,color:#fff
    class C1,C2,C3,C4,C5,C6 compensate
    classDef terminal fill:#1f3d1f,stroke:#66bb6a,color:#fff
    class Done terminal
    classDef failterm fill:#3d1f1f,stroke:#e06666,color:#fff
    class Failed failterm
```
