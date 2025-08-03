import type { TransitionImpact } from '@ground0/shared'
import { TransitionRunner } from '../base'

export class LocalOnlyTransitionRunner extends TransitionRunner<TransitionImpact.LocalOnly> {}
