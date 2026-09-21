import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'

export function Welcome() {
  return (
    <Screen background="bg-ink">
      <StatusBar tone="light" />
      <div className="relative px-7 pt-[120px] pb-10 flex flex-col min-h-[calc(100vh-44px)]">
        <div>
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-full border-[8px] border-brand mb-[34px]">
            <span className="w-[21px] h-[21px] rounded-full bg-brand" />
          </span>
          <h1 className="font-display font-bold text-[46px] leading-[1.02] tracking-[-0.035em] text-cream">
            Where Africa gets to work.
          </h1>
          <p className="mt-[22px] text-[17px] leading-[1.55] text-muted-3">
            Find work, hire trusted pros, sell your goods and get paid safely — all in one app.
          </p>
        </div>
        <div className="mt-auto">
          <Button to="/signup">Create an account</Button>
          <Button to="/signin" variant="secondary" className="mt-3 text-cream">
            I already have one
          </Button>
          <p className="mt-5 text-center text-[13px] leading-[1.5] text-muted-4">
            By continuing you agree to our Terms and Privacy Policy.
          </p>
        </div>
      </div>
    </Screen>
  )
}
