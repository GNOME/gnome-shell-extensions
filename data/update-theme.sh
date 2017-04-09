#!/bin/sh

INPUT=$1
OUTPUT=$2

if [ `which sassc` ]
then
  sassc -a $INPUT | tee ${INPUT%%.scss}.css > $OUTPUT
fi
