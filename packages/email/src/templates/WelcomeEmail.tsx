import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components';

export type WelcomeEmailProps = {
  displayName: string;
  appUrl: string;
};

export function WelcomeEmail({ displayName, appUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to the template SaaS</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ padding: 24 }}>
          <Heading>Welcome, {displayName}.</Heading>
          <Text>
            Your account is ready. Sign in at <a href={appUrl}>{appUrl}</a> to get started.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
