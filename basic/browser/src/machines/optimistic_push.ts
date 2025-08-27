import { setup } from 'xstate'

export const optimisticPushMachine = setup({}).createMachine({
	type: 'parallel'
})
