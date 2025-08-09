import type { ActorRef, Snapshot, EventObject } from 'xstate'

export type SomeActorRef = ActorRef<Snapshot<unknown>, EventObject, EventObject>
