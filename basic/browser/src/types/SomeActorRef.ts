import type { ActorRef, Snapshot, EventObject } from 'xstate'

/**
 * @deprecated Use the actual type of the `ActorRef` instead using the
 * `ActorRefFrom<T>` helper.
 */
export type SomeActorRef = ActorRef<Snapshot<unknown>, EventObject, EventObject>
