export class MemoryModelStore<MemoryModel extends object> {
	private subscribers = new Map<
		symbol,
		(newValue: MemoryModel | undefined) => unknown
	>()

	public currentValue: MemoryModel | undefined = undefined
	public updateSubscribers() {
		for (const subscriber of this.subscribers.values()) {
			subscriber(this.currentValue)
		}
	}

	public subscribe(update: (newValue: MemoryModel | undefined) => unknown) {
		update(this.currentValue)

		const subscriberId = Symbol()
		this.subscribers.set(subscriberId, update)

		return () => this.subscribers.delete(subscriberId)
	}
}
