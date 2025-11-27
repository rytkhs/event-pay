import { ContactForm } from "./ContactForm";

export const dynamic = "force-static";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-muted/30 py-16 sm:py-24">
      <div className="container mx-auto w-full max-w-2xl space-y-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">お問い合わせ</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            みんなの集金に関するご質問・ご意見をお寄せください
          </p>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}
