export class MemoryModelStore<MemoryModel extends object> {
	public currentValue: MemoryModel | undefined = undefined
	private subscribers = new Map<
		symbol,
		(newValue: MemoryModel | undefined) => unknown
	>()
	public subscribe(update: (newValue: MemoryModel | undefined) => unknown) {
		update(this.currentValue)

		const subscriberId = Symbol()
		this.subscribers.set(subscriberId, update)

		return () => this.subscribers.delete(subscriberId)
	}
}
