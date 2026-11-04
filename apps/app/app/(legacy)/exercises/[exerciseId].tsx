import { LegacyRedirect } from '../../../src/components/LegacyRedirect'

const FROM = '/exercises/:exerciseId'

export default function Legacy() {
  return <LegacyRedirect from={FROM} />
}
