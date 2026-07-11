import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components';

export type OperatorInviteEmailProps = {
  inviterEmail: string;
  acceptUrl: string;
};

export function OperatorInviteEmail({ inviterEmail, acceptUrl }: OperatorInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You've been invited as an Operator</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ padding: 24 }}>
          <Heading>You've been invited as an Operator</Heading>
          <Text>
            {inviterEmail} invited you to the operator backoffice. Accept below — this link expires
            in 7 days and can be used once.
          </Text>
          <Link href={acceptUrl}>{acceptUrl}</Link>
        </Container>
      </Body>
    </Html>
  );
}
