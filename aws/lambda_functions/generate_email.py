"""
PiazzaLens — Generate Email Lambda Function
Uses Amazon Bedrock to draft personalized outreach emails for struggling students.
"""

import json
import os
import boto3

bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")


def handler(event, context):
    """
    POST /generate-email
    Body: { "studentName": "...", "topics": [...], "professor": "...", "type": "struggling|assignment" }
    Returns: { "email": "..." }
    """
    try:
        body = json.loads(event.get("body", "{}"))
        student_name = body.get("studentName", "Student")
        topics = body.get("topics", [])
        professor = body.get("professor", "Prof. Smith")
        email_type = body.get("type", "struggling")

        try:
            email = generate_with_bedrock(student_name, topics, professor, email_type)
        except Exception as e:
            print(f"Bedrock error: {e}")
            email = generate_template(student_name, topics, professor, email_type)

        return response(200, {"email": email})

    except Exception as e:
        print(f"Error: {e}")
        return response(500, {"error": str(e)})


def generate_with_bedrock(student_name, topics, professor, email_type):
    """Use Bedrock to generate a personalized email."""
    
    first_name = student_name.split(" ")[0] if student_name else "Student"
    topics_str = ", ".join(topics[:5]) if topics else "recent course material"

    if email_type == "assignment":
        context = f"{first_name} has not submitted a recent assignment."
    else:
        context = f"{first_name} has been asking many questions about {topics_str} and showing signs of struggle."

    prompt = f"""You are a caring university professor named {professor}. Write a brief, warm, and supportive email to a student named {first_name}.

Context: {context}

Requirements:
- Include a subject line starting with "Subject: "
- Be warm but professional
- Offer to meet during office hours
- Don't be condescending
- Keep it under 100 words (body only)
- Make the student feel supported, not singled out

Write only the email, nothing else."""

    request_body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 512,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    })

    bedrock_response = bedrock.invoke_model(
        modelId=MODEL_ID,
        body=request_body,
        contentType="application/json",
        accept="application/json"
    )

    result = json.loads(bedrock_response["body"].read())
    return result["content"][0]["text"].strip()


def generate_template(student_name, topics, professor, email_type):
    """Fallback: use pre-written template."""
    first_name = student_name.split(" ")[0] if student_name else "Student"
    topics_str = " and ".join(topics[:3]) if topics else "recent course material"

    if email_type == "assignment":
        return f"""Subject: Checking in — missing assignment

Hi {first_name},

I noticed that a recent assignment hasn't been submitted yet. I wanted to check in and see if everything is okay.

If you're having trouble with the assignment or need an extension, please let me know. I'd rather work with you to find a solution than have you fall behind.

Feel free to come to office hours or email me to set up a time to chat.

Best,
{professor}"""
    else:
        return f"""Subject: Checking in about the course

Hi {first_name},

I noticed you've had several questions recently about {topics_str}. That's completely normal — these are challenging topics that many students find tricky.

If you'd like, we can schedule a quick 15-minute meeting to go over any concepts you're finding difficult. I'm available during office hours, or we can find another time that works for you.

Don't hesitate to reach out — I'm here to help.

Best,
{professor}"""


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps(body)
    }
