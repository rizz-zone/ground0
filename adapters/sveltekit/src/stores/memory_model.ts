export class MemoryModelStore<MemoryModel extends object> {
	private subscribers = new Map<
		symbol,
		(newValue: MemoryModel | undefined) => unknown
	>()

	private _currentValue: MemoryModel | undefined = undefined

	public get currentValue(): MemoryModel | undefined {
		return this._currentValue
	}
	public set currentValue(value: MemoryModel | undefined) {
		this._currentValue = value
		for (const subscriber of this.subscribers.values()) {
			subscriber(value)
		}
	}

	public subscribe(update: (newValue: MemoryModel | undefined) => unknown) {
		update(this.currentValue)

		const subscriberId = Symbol()
		this.subscribers.set(subscriberId, update)

		return () => this.subscribers.delete(subscriberId)
	}
}
