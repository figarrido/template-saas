import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components';

export type InviteEmailProps = {
  orgName: string;
  inviterName: string;
  acceptUrl: string;
};

export function InviteEmail({ orgName, inviterName, acceptUrl }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You have been invited to {orgName}</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ padding: 24 }}>
          <Heading>Join {orgName}</Heading>
          <Text>
            {inviterName} invited you to collaborate. Accept the invitation below — it expires in 7
            days.
          </Text>
          <Link href={acceptUrl}>{acceptUrl}</Link>
        </Container>
      </Body>
    </Html>
  );
}
