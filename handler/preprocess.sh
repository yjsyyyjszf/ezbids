#!/bin/bash

#module load pigz

set -e
set -x

if [ -z $1 ]; then
    echo "please specify root dir"
    exit 1
fi
root=$1

echo "removing .nii.gz"
find $root -name "*.nii.gz" -exec rm -rf {} \;

echo "removing .json"
find $root -name "*.json" -exec rm -rf {} \;

echo "removing .nii"
find $root -name "*.nii" -exec rm -rf {} \;

time ./expand.sh $root

echo processing $root

echo "finding dicom directories"
./find_dicomdir.py $root > $root/dcm2niix.list
cat $root/dcm2niix.list

echo "running dcm2niix"
true > $root/dcm2niix.done
function d2n {
    path=$1
    echo "----------------------- $path ------------------------"
    dcm2niix -v 1 -ba n -z o -f 'time-%t-sn-%s' $path
    echo $1 >> dcm2niix.done
}
export -f d2n
cat $root/dcm2niix.list | parallel --wd $root -j 4 d2n {}

#find products
(cd $root && find . -type f \( -name "*.json" -o -name "*.nii.gz" \) > list)
cat $root/list

if [ -s $root/list ]; then
    echo "list is not empty.. proceeding"
else
    echo "couldn't find any dicom files. aborting"
    exit 1
fi

echo "running analyzer"
time ./analyzer/run.sh $root

echo "done preprocessing"
