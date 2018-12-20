# Publishing Google Quiz Results

The access server is setup to automagically process and get the results of a google quiz from a published csv.

This is a brief guide on how to setup the quiz and publish it's results.

## 1 - Quiz Requirements

In order to be processed, the quiz must:
- Contain exactly one question with the word "pheme" in the title, this should collect the user's pheme number. An example of how to format this is below.
  ![pheme format](https://i.imgur.com/xI58kfg.png)
- Be enabled as a quiz, and have questions with assigned marks.
  ![enable quiz](https://i.imgur.com/4kbWarh.gif)

## 2 - Push Quiz Results to a Google Sheet

Go to:
  - "Responses"
  - Click on the three dots in the top right
  - Click "Select response destination"
  - Create a new sheet and save

You can open the new google sheet by pressing the green button

![link-sheet](https://i.imgur.com/Ob57JHF.gif)

## 3 - Publish results as CSV

In the now-created sheet
- Click "File" in the top left
- Select "Publish to the web..."
- Change "Entire Document" to "Form Responses 1"
- Change "Web page" to "Comma-separated values (.csv)"
- Click "Publish"
- Copy the generated link and paste it into the training config under "Results Published CSV Link"

![pub sheet](https://i.imgur.com/NJ979jS.gif)