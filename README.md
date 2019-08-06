# Spotboard DOMjudge converter

This converter generates `contest.json` and `runs.json` file for Spotboard using DOMjudge API v4.  
It was tested with DOMjudge 7.1.0

## Requirements

- Node.js 8+

### Install package

```
$ npm install
```

## Before Start
Open the admin panel and select 'Configuration'.
Find 'data_source' option and make sure this value is set to 0.

> If you have a question why it should be 0, please check this issue.  
> https://github.com/DOMjudge/domjudge/issues/612


## Configuration

[config.js](./config.js)

## How to run

```
$ npm start
```
